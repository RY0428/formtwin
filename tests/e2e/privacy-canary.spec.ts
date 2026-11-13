import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { installFakeLanguageModel, type FakeOptions } from './fakeLanguageModel.ts';

// M9 canary checks (architecture.md §13 "カナリア"): unregistered fictional values, partial input,
// before/after edits, Unicode variants and encodings, image bytes. Scans every request (any origin,
// including same-origin), WebSocket frames and console output, then browser storage after the flow
// and after End session. Fake model only: not device evidence. A clean scan is not proof that no
// transformed form (rendered image, split value) left the page; the CSP and the code paths are the
// primary controls (architecture.md §13).
const ORIGIN = 'http://localhost:4174';
const IMAGE = 'data/eval/explore/explore-03.png';

// Fictional, unregistered canary values.
const FAMILY = 'QZXKANARIQ';
const GIVEN = 'VYJ PLUMEX';
const CARD = 'QZ97531864XW';
const TYPED_PARTIAL = 'WOLFRAMQX';
const EDITED_AFTER = 'KESTRELZQ';
const JA = 'カナリア試験値';

function variants(value: string): string[] {
  const out = new Set<string>([value]);
  for (const v of [value, value.toLowerCase()]) {
    out.add(v);
    out.add(encodeURIComponent(v));
    out.add(encodeURIComponent(v).replace(/%20/g, '+'));
    out.add(Buffer.from(v, 'utf8').toString('base64').replace(/=+$/, ''));
    out.add(v.normalize('NFD'));
    out.add(v.normalize('NFKC'));
    // Full-width form of ASCII letters/digits.
    out.add([...v].map((c) => (c >= '!' && c <= '~' ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c)).join(''));
  }
  // Partial values: any 6-character window of the value.
  for (let i = 0; i + 6 <= value.length; i += 1) {
    const w = value.slice(i, i + 6);
    if (!w.includes(' ')) out.add(w);
  }
  return [...out].filter((v) => v.length >= 4);
}

const CANARIES = [FAMILY, GIVEN, CARD, TYPED_PARTIAL, EDITED_AFTER, JA].flatMap(variants);
// A slice of the image bytes as base64: the image itself must not appear in any request either.
const imageBytes = readFileSync(IMAGE);
// Base64 slices at all three 3-byte alignments, and raw byte slices for binary bodies.
const IMAGE_SLICES = [200, 2000].flatMap((at) =>
  [0, 1, 2].map((shift) => imageBytes.subarray(at + shift, at + shift + 45).toString('base64')),
);
const IMAGE_RAW = [imageBytes.subarray(300, 340), imageBytes.subarray(3000, 3040)];

function findCanary(text: string): string | undefined {
  return [...CANARIES, ...IMAGE_SLICES].find((c) => text.includes(c));
}

/** Searches a request body as UTF-8 text, as Latin-1 text and as raw bytes. */
function findInBody(body: Buffer): string | undefined {
  return (
    findCanary(body.toString('utf8')) ??
    findCanary(body.toString('latin1')) ??
    (IMAGE_RAW.some((raw) => body.includes(raw)) ? 'raw image bytes' : undefined)
  );
}

interface Observed {
  readonly network: string[];
  readonly bodies: { url: string; body: Buffer }[];
  readonly bodyless: string[];
  readonly websocket: string[];
  readonly console: string[];
  readonly failed: string[];
}

async function observe(page: Page): Promise<Observed> {
  await page.addInitScript(() => {
    const list: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = list;
    document.addEventListener('securitypolicyviolation', (e) => list.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const seen: Observed = { network: [], bodies: [], bodyless: [], websocket: [], console: [], failed: [] };
  page.context().on('request', (req) => {
    const url = req.url();
    // data:/blob: never leave the page (the SDK converts the image with fetch('data:…')).
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    const body = req.postDataBuffer();
    seen.network.push(`${req.method()} ${url}\n${JSON.stringify(req.headers())}`);
    if (body !== null) seen.bodies.push({ url, body });
    // A request with a method that carries a body but none visible to Playwright (File/Blob) fails loudly.
    else if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) seen.bodyless.push(`${req.method()} ${url}`);
  });
  page.context().on('requestfailed', (req) => {
    if (!req.url().startsWith('data:') && !req.url().startsWith('blob:')) seen.failed.push(req.url());
  });
  page.on('websocket', (ws) => {
    seen.websocket.push(`open ${ws.url()}`);
    ws.on('framesent', (f) => seen.websocket.push(String(f.payload)));
  });
  // Console: the text preview is shallow, so also serialise every argument in full.
  page.on('console', (m) => {
    seen.console.push(m.text());
    void Promise.all(m.args().map((a) => a.jsonValue().catch(() => '')))
      .then((vals) => seen.console.push(JSON.stringify(vals)))
      .catch(() => undefined);
  });
  page.on('pageerror', (e) => seen.console.push(String(e)));
  return seen;
}

/** Everything the page can read back from browser storage, as text. */
async function dumpStorage(page: Page) {
  return page.evaluate(async () => {
    const out: { area: string; text: string }[] = [];
    if (document.cookie !== '') out.push({ area: 'cookie', text: document.cookie });
    for (const [area, s] of [
      ['localStorage', localStorage],
      ['sessionStorage', sessionStorage],
    ] as const) {
      for (let i = 0; i < s.length; i += 1) {
        const k = s.key(i) ?? '';
        out.push({ area, text: `${k}=${s.getItem(k) ?? ''}` });
      }
    }
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        const res = await cache.match(req);
        out.push({ area: 'cache', text: `${name} ${req.url} ${res === undefined ? '' : await res.text()}` });
      }
    }
    try {
      const root = await navigator.storage.getDirectory();
      for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
        out.push({ area: 'opfs', text: name });
      }
    } catch {
      /* OPFS unavailable: nothing stored */
    }
    const dbs: string[] = [];
    for (const info of await indexedDB.databases()) {
      const name = info.name ?? '';
      dbs.push(name);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      for (const store of [...db.objectStoreNames]) {
        const rows = await new Promise<unknown[]>((resolve, reject) => {
          const r = db.transaction(store, 'readonly').objectStore(store).getAll();
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
          const r = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        out.push({ area: `indexedDB:${name}/${store}`, text: JSON.stringify({ keys, rows }) });
      }
      db.close();
    }
    return { out, dbs };
  });
}

/** Known non-personal storage: Firebase's heartbeat (date + SDK user agent), see docs/decisions.md. */
const ALLOWED_DATABASES = ['firebase-heartbeat-database'];

async function expectCleanStorage(page: Page, when: string) {
  const { out, dbs } = await dumpStorage(page);
  for (const name of dbs) expect(ALLOWED_DATABASES, `${when}: unexpected IndexedDB ${name}`).toContain(name);
  const areas = out.filter((o) => !o.area.startsWith('indexedDB:')).map((o) => o.area);
  expect(areas, `${when}: cookies, Web Storage, Cache Storage and OPFS must be empty`).toEqual([]);
  // The allowed heartbeat database must hold only its recorded shape (date + SDK user agent).
  for (const o of out.filter((x) => x.area.startsWith('indexedDB:firebase-heartbeat-database/'))) {
    const { rows } = JSON.parse(o.text) as { rows: unknown[] };
    for (const row of rows) {
      const r = row as { heartbeats?: { agent?: unknown; date?: unknown }[]; lastSentHeartbeatDate?: unknown };
      expect(Object.keys(r).every((k) => k === 'heartbeats' || k === 'lastSentHeartbeatDate'), `${when}: heartbeat row keys`).toBe(true);
      for (const h of r.heartbeats ?? []) {
        expect(Object.keys(h).sort(), `${when}: heartbeat entry keys`).toEqual(['agent', 'date']);
        expect(String(h.date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  }
  for (const o of out) expect(findCanary(o.text), `${when}: canary in ${o.area}`).toBeUndefined();
}

async function expectClean(page: Page, seen: Observed) {
  // Best-effort end (pagehide) and pending timers run while the listeners are still recording.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
  await page.waitForTimeout(300);
  const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  expect(violations, 'no CSP violation: no code path tried to reach a blocked destination').toEqual([]);
  expect(seen.failed, 'no failed request').toEqual([]);
  expect(seen.bodyless, 'every request body is visible to the scan').toEqual([]);
  for (const n of seen.network) expect(findCanary(n), `canary in request:\n${n.slice(0, 300)}`).toBeUndefined();
  for (const b of seen.bodies) expect(findInBody(b.body), `canary in request body: ${b.url}`).toBeUndefined();
  expect(seen.websocket, 'no WebSocket').toEqual([]);
  for (const c of seen.console) expect(findCanary(c), `canary in console: ${c}`).toBeUndefined();
  const foreign = seen.network.filter((n) => new URL(n.split(/\s/)[1] ?? 'about:blank').origin !== ORIGIN);
  expect(foreign, 'no request leaves the private origin').toEqual([]);
}

test('canary values never appear in requests, WebSocket, console or storage (full flow and end)', async ({ page }) => {
  const fake: FakeOptions = {
    availability: 'available',
    response: '',
    // First answer invalid → one on-device retry, then the canary values as candidates.
    responses: [
      'not json',
      JSON.stringify({
        fields: [
          { key: 'fullName', value: `${FAMILY} ${GIVEN}` },
          { key: 'residenceCardNumber', value: CARD },
          { key: 'periodOfStayExpiry', value: '2027年03月31日' },
        ],
      }),
    ],
  };
  const seen = await observe(page);
  await page.addInitScript(installFakeLanguageModel, fake);
  await page.goto(`${ORIGIN}/`);
  await expect(page.getByTestId('boot-status')).toHaveText('ready');
  await page.getByRole('button', { name: 'Prepare AI' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('ready');
  await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles(IMAGE);
  await page.getByRole('button', { name: 'Extract on this device' }).click();
  await page.getByRole('button', { name: `Use name: family “${FAMILY}”, given “${GIVEN}”` }).click();
  await page.getByRole('button', { name: /^Use card number/ }).click();
  await page.getByRole('button', { name: /^Use expiry/ }).click();

  // Partial typing, then an edit (before/after values), and a Japanese value typed into a field.
  const family = page.getByLabel(/^Family name/);
  await family.fill('');
  await family.pressSequentially(TYPED_PARTIAL.slice(0, 5));
  await family.pressSequentially(TYPED_PARTIAL.slice(5));
  await family.fill(EDITED_AFTER);
  await page.getByLabel(/^Given name/).fill(JA);
  for (const c of await page.getByLabel('Checked against my card').all()) await c.check();
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByTestId('pdf-preview')).toHaveAttribute('data-state', 'done');

  // Lock and resume with the values in memory, then storage while the session is open.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('button', { name: 'Resume' }).click();
  await expectCleanStorage(page, 'during the session');

  await page.getByRole('button', { name: 'End session and clear data' }).click();
  await expect(family).toHaveValue('');
  await expectCleanStorage(page, 'after End session');
  await expectClean(page, seen);
});

test('canary values stay local on failure paths (time-out, invalid output twice)', async ({ page }) => {
  for (const fake of [
    { availability: 'available', response: JSON.stringify({ fields: [{ key: 'fullName', value: FAMILY }] }), delayMs: 40_000 },
    { availability: 'available', response: `not json ${FAMILY}` },
  ] satisfies FakeOptions[]) {
    const p = await page.context().newPage();
    const seen = await observe(p);
    await p.clock.install();
    await p.addInitScript(installFakeLanguageModel, fake);
    await p.goto(`${ORIGIN}/`);
    await expect(p.getByTestId('boot-status')).toHaveText('ready');
    await p.getByRole('button', { name: 'Prepare AI' }).click();
    await expect(p.getByTestId('ai-status')).toHaveText('ready');
    await p.getByLabel(/^Family name/).fill(EDITED_AFTER);
    await p.getByLabel('Residence card image (JPEG or PNG)').setInputFiles(IMAGE);
    await p.getByRole('button', { name: 'Extract on this device' }).click();
    await p.clock.fastForward('01:30');
    await expect(p.getByTestId('error')).toHaveText(/timeout|invalid_output/);
    await expectCleanStorage(p, 'after a failure');
    await expectClean(p, seen);
    await p.close();
  }
});
