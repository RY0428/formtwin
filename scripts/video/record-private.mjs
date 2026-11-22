#!/usr/bin/env node
// Records demo-video shots 5–9 (personal-entry app) on the developer's Mac: real Chrome, the dedicated
// profile with the on-device model already installed (see scripts/device/device-check.mjs), the HOSTED app,
// fictional sample card only. Frames come from the Chrome DevTools screencast (JPEG, 1920×1080), so the
// result is sharper than Playwright's recordVideo.
//
//   node scripts/video/record-private.mjs [--out ~/formtwin-video] [--card data/eval/explore/explore-01.png]
//
// Output (outside the repository): <out>/raw/shot05.mp4 … shot09.mp4, one JSON per shot (kept time ranges,
// timed captions, zoom rectangle) for scripts/video/assemble.mjs, and <out>/raw/recording.json (build, Chrome
// version, what the model returned compared with the card; no screenshots of anything but fictional data).
//
// Presentation aids only, not app changes: a drawn cursor dot (the screencast has no cursor), scrolling, and
// Chrome's offline mode (context.setOffline). Waits longer than WAIT_KEEP_S are cut later by assemble.mjs and
// get the caption "Edited: waiting time shortened".
//
// Dry run outside the Mac (never device evidence): FORMTWIN_VIDEO_DRY=1 FORMTWIN_CHROME_PATH=<chromium>
// uses a stand-in model, a temporary profile and headless Chromium.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const OUT = resolve(arg('--out', join(homedir(), 'formtwin-video')));
const RAW = join(OUT, 'raw');
const SHOTS = JSON.parse(readFileSync('scripts/video/shots.json', 'utf8'));
const CARD = arg('--card', SHOTS.sample.image);
const MANIFEST = JSON.parse(readFileSync(join(CARD, '..', 'manifest.json'), 'utf8'));
const TRUTH = MANIFEST.cases.find((c) => c.file === basename(CARD))?.groundTruth;
if (!TRUTH) throw new Error(`${CARD} is not in its manifest`);
const FORMDEF = JSON.parse(readFileSync('forms/defs/isa-930004094/rev-2.formdef.json', 'utf8'));

const URL_PRIVATE = 'https://formtwin-dev-private.web.app/';
const DRY = process.env.FORMTWIN_VIDEO_DRY === '1';
const PROFILE = DRY ? mkdtempSync(join(tmpdir(), 'formtwin-video-dry-')) : join(homedir(), '.formtwin-device-profile');
const VIEW = { width: 1536, height: 864 }; // × deviceScaleFactor 1.25 = 1920×1080 frames (looks like 125 % zoom)
const DSF = 1.25;
const WAIT_KEEP_S = 1.2; // a wait keeps its first 1.2 s and its last 0.4 s; the middle is cut in editing
const log = (m) => console.log(`[record]${DRY ? ' [DRY RUN, fake model]' : ''} ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Same stand-in as device-check's dry run (never used on the Mac).
function installFake() {
  const answer = JSON.stringify({ fields: [{ key: 'fullName', value: 'TANAKA HANAKO' }, { key: 'residenceCardNumber', value: 'AB12345678C0' }, { key: 'periodOfStayExpiry', value: '2027年03月31日' }] });
  let state = 'available';
  window.LanguageModel = {
    availability: () => Promise.resolve(state),
    create: () => new Promise((r) => setTimeout(() => { state = 'available'; r({ prompt: () => new Promise((ok) => setTimeout(() => ok(answer), 4000)), destroy() {} }); }, 500)),
  };
}

async function launch() {
  mkdirSync(PROFILE, { recursive: true });
  return chromium.launchPersistentContext(PROFILE, {
    ...(process.env.FORMTWIN_CHROME_PATH ? { executablePath: process.env.FORMTWIN_CHROME_PATH } : { channel: 'chrome' }),
    headless: DRY,
    viewport: VIEW,
    deviceScaleFactor: DSF,
    locale: 'en-US', // the app is English; also the browser's own controls (file chooser button)
    acceptDownloads: true,
    // As device-check: Playwright's default switches would block the on-device model.
    ignoreDefaultArgs: true,
    args: [
      `--user-data-dir=${PROFILE}`,
      '--remote-debugging-pipe',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1600,1000',
      '--lang=en-US',
      // macOS ignores --lang: Chrome's UI language (file chooser button text) follows AppleLanguages.
      ...(process.platform === 'darwin' ? ['-AppleLanguages', '(en-US)'] : []),
      ...(DRY ? ['--headless=new', '--no-sandbox'] : []),
      'about:blank',
    ],
  });
}

/** DevTools screencast into JPEG frames with timestamps (seconds). */
class Screencast {
  constructor(cdp, dir) {
    this.cdp = cdp;
    this.dir = dir;
    this.frames = [];
    this.t0 = null;
    cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
      const t = metadata.timestamp ?? Date.now() / 1000;
      if (this.t0 === null) this.t0 = t;
      const file = join(dir, `f${String(this.frames.length).padStart(6, '0')}.jpg`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      this.frames.push({ t: t - this.t0, file });
      await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
    });
  }
  async start() {
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    this.wall0 = Date.now();
  }
  /** Seconds since the first frame (wall clock; screencast timestamps share this clock closely enough). */
  now() {
    return (Date.now() - this.wall0) / 1000;
  }
  async stop() {
    await this.cdp.send('Page.stopScreencast').catch(() => undefined);
  }
  /** One shot [a, b] as an H.264 clip at 30 fps (holds the last frame before a, and each frame until the next). */
  writeClip(a, b, out) {
    const before = this.frames.filter((f) => f.t <= a).at(-1);
    const inside = this.frames.filter((f) => f.t > a && f.t < b);
    const list = [...(before ? [{ ...before, t: a }] : []), ...inside];
    if (list.length === 0) throw new Error(`no frames for ${out}`);
    const lines = ['ffconcat version 1.0'];
    list.forEach((f, i) => {
      const next = i + 1 < list.length ? list[i + 1].t : b;
      lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(3)}`);
    });
    lines.push(`file '${list.at(-1).file}'`); // concat demuxer: the last entry needs repeating
    const listFile = `${out}.ffconcat`;
    writeFileSync(listFile, `${lines.join('\n')}\n`);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-vf', 'fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
      '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-t', (b - a).toFixed(3), out]);
    rmSync(listFile);
  }
}

// --- a drawn cursor (the screencast does not show the system cursor). CSSOM only, no <style> element. ---
async function ensureCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('video-cursor')) return;
    const c = document.createElement('div');
    c.id = 'video-cursor';
    Object.assign(c.style, {
      position: 'fixed', left: '40px', top: '40px', width: '22px', height: '22px', marginLeft: '-11px', marginTop: '-11px',
      borderRadius: '50%', background: 'rgba(37,99,235,0.35)', border: '2px solid rgba(37,99,235,0.9)',
      pointerEvents: 'none', zIndex: '2147483647', transition: 'left 450ms ease, top 450ms ease, transform 150ms',
    });
    document.body.appendChild(c);
  });
}
async function pointAt(page, locator) {
  const visible = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 80 && r.bottom <= window.innerHeight - 80;
  });
  if (!visible) {
    await locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await sleep(700);
  }
  const box = await locator.boundingBox();
  if (!box) return;
  await ensureCursor(page);
  await page.evaluate(([x, y]) => {
    const c = document.getElementById('video-cursor');
    c.style.left = `${x}px`;
    c.style.top = `${y}px`;
  }, [box.x + Math.min(box.width / 2, 60), box.y + box.height / 2]);
  await sleep(550);
}
async function click(page, locator) {
  await pointAt(page, locator);
  await page.evaluate(() => { document.getElementById('video-cursor').style.transform = 'scale(0.7)'; });
  await locator.click();
  await sleep(150);
  await page.evaluate(() => { const c = document.getElementById('video-cursor'); if (c) c.style.transform = ''; });
}
async function typeSlowly(page, locator, text) {
  await click(page, locator);
  await locator.press('ControlOrMeta+a');
  await sleep(250);
  await locator.press('Backspace');
  await sleep(300);
  await locator.pressSequentially(text, { delay: 110 });
}
const scrollTo = async (locator, block = 'center') => {
  await locator.evaluate((el, b) => el.scrollIntoView({ behavior: 'smooth', block: b }), block);
  await sleep(900);
};

async function main() {
  mkdirSync(RAW, { recursive: true });
  const frames = join(RAW, 'frames');
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const ctx = await launch();
  if (DRY) await ctx.addInitScript(installFake);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const meta = { startedAt: new Date().toISOString(), dryRun: DRY || undefined, card: CARD, chrome: ctx.browser()?.version() ?? null, shots: {} };

  // Not recorded: load the hosted app online, check it is the expected build and the model is installed.
  await page.goto(URL_PRIVATE);
  await page.getByTestId('boot-status').filter({ hasText: 'ready' }).waitFor({ timeout: 60_000 });
  meta.packageInfo = await page.getByTestId('package-info').innerText();
  meta.build = (meta.packageInfo.match(/Build ([0-9a-f]{7,})/) ?? [])[1] ?? 'unknown';
  if (!meta.packageInfo.includes(SHOTS.package)) throw new Error(`hosted app shows another package: ${meta.packageInfo}`);
  let availability = await page.getByTestId('availability').innerText();
  for (let i = 0; i < 60 && availability === 'checking'; i += 1) {
    await sleep(1000);
    availability = await page.getByTestId('availability').innerText();
  }
  if (availability !== 'available') throw new Error(`on-device model is "${availability}", not installed: run npm run device:check first`);
  log(`build ${meta.build}, Chrome ${meta.chrome}, model available`);
  await ctx.setOffline(true); // Chrome offline mode for shots 5–9 (until the reload in shot 9)
  await page.evaluate(() => window.scrollTo(0, 0));
  await ensureCursor(page);

  const cdp = await ctx.newCDPSession(page);
  const cast = new Screencast(cdp, frames);
  await cast.start();
  await sleep(500);
  const shots = [];
  let current = null;
  const begin = (id) => {
    if (current) current.end = cast.now();
    current = { id, start: cast.now(), waits: [], captions: [], zoom: null };
    shots.push(current);
    log(`shot ${id}`);
  };
  /** Runs fn; if it takes longer than WAIT_KEEP_S + 0.4 s, the middle is marked to be cut. */
  const wait = async (fn) => {
    const a = cast.now();
    const r = await fn();
    const b = cast.now();
    if (b - a > WAIT_KEEP_S + 0.4) current.waits.push([a + WAIT_KEEP_S - current.start, b - 0.4 - current.start]);
    return r;
  };
  const caption = (text, from, to = null) => current.captions.push({ text, from: from - current.start, to: to === null ? null : to - current.start });

  // Shot 5: separate site, footer with the signed package and the build.
  begin(5);
  await sleep(2500);
  await scrollTo(page.getByTestId('package-info'), 'end');
  await pointAt(page, page.getByTestId('package-info'));
  await sleep(3500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(2000);

  // Shot 6: Prepare AI → ready; choose the fictional card; extract on this device.
  begin(6);
  await click(page, page.getByRole('button', { name: 'Prepare AI' }));
  await wait(() => page.getByTestId('ai-status').filter({ hasText: 'ready' }).waitFor({ timeout: 5 * 60_000 }));
  await sleep(1200);
  const fileInput = page.getByLabel('Residence card image (JPEG or PNG)');
  await pointAt(page, fileInput);
  await fileInput.setInputFiles(CARD);
  await page.getByAltText('Selected sample').waitFor();
  await scrollTo(page.getByAltText('Selected sample'));
  await sleep(1800);
  const extract = page.getByRole('button', { name: 'Extract on this device' });
  await wait(async () => {
    for (let i = 0; i < 120 && !(await extract.isEnabled()); i += 1) await sleep(500);
  });
  await click(page, extract);
  const firstUse = page.getByRole('button', { name: /^Use / }).first();
  const error = page.getByTestId('error');
  await wait(() => Promise.race([firstUse.waitFor({ timeout: 180_000 }), error.waitFor({ timeout: 180_000 })]).catch(() => undefined));
  if ((await error.count()) > 0) throw new Error(`extraction failed: ${await error.innerText()}`);
  const result = page.getByTestId('result');
  await scrollTo(result, 'center');
  await pointAt(page, page.getByText('Candidates are not confirmed.'));
  await sleep(5000);

  // Shot 7: use candidates; type what is not offered or not right; tick every field.
  begin(7);
  const read = Object.fromEntries(
    await page.getByTestId('result').locator('dt').evaluateAll((dts) => dts.map((dt) => [dt.textContent, dt.nextElementSibling?.textContent ?? null])),
  );
  meta.extraction = {
    fullNameExact: read.fullName === TRUTH.fullName,
    numberExact: read.residenceCardNumber === TRUTH.residenceCardNumber,
    expiryRead: read.periodOfStayExpiry ?? null,
    numberOffered: (await page.getByRole('button', { name: /^Use card number/ }).count()) > 0,
    typedByHand: [],
  };
  const useName = page.getByRole('button', { name: /^Use name/ }).first();
  if ((await useName.count()) > 0) {
    await click(page, useName);
    await sleep(900);
  }
  const useExpiry = page.getByRole('button', { name: /^Use expiry/ });
  if ((await useExpiry.count()) > 0) {
    await click(page, useExpiry);
    await sleep(900);
  }
  if (meta.extraction.numberOffered) {
    await click(page, page.getByRole('button', { name: /^Use card number/ }));
    await sleep(900);
  } else {
    await pointAt(page, page.getByTestId('number-warning'));
    await sleep(3000);
  }
  const [family, ...given] = TRUTH.fullName.split(' ');
  const [y, m, d] = (TRUTH.periodOfStayExpiry ?? '--').split('-');
  const want = [
    [/^Family name/, family], [/^Given name/, given.join(' ')],
    [/^Expiry year/, y], [/^Expiry month/, String(Number(m))], [/^Expiry day/, String(Number(d))],
    [/^Residence card number/, TRUTH.residenceCardNumber],
  ];
  await scrollTo(page.getByLabel(/^Family name/), 'start');
  for (const [label, value] of want) {
    const input = page.getByLabel(label);
    const now = await input.inputValue();
    const same = label.source.startsWith('^Expiry') ? now !== '' && Number(now) === Number(value) : now === value;
    if (!same) {
      await typeSlowly(page, input, value);
      meta.extraction.typedByHand.push(label.source.slice(1));
      await sleep(700);
    }
  }
  for (const box of await page.getByLabel('Checked against my card').all()) {
    await click(page, box);
    await sleep(250);
  }
  await sleep(1500);

  // Shot 8: Create PDF → preview, zoom on the card number, Save PDF, printing guidance.
  begin(8);
  await click(page, page.getByRole('button', { name: 'Create PDF' }));
  const preview = page.locator('[data-testid="pdf-preview"][data-state="done"]');
  await wait(() => preview.waitFor({ timeout: 120_000 }));
  const place = FORMDEF.fields.find((f) => f.fieldId === 'residenceCardNumber').placement;
  // Centre the card-number line of the preview in the viewport, then zoom on it in editing.
  const A4 = { w: 595.28, h: 841.89 };
  await preview.evaluate((el, [py, a4]) => {
    const r = el.getBoundingClientRect();
    const s = r.width / a4.w;
    window.scrollBy({ top: r.top + (a4.h - py) * s - window.innerHeight / 2, behavior: 'smooth' });
  }, [place.y, A4]);
  await sleep(1200);
  const rect = await preview.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; });
  const s = rect.w / A4.w;
  const cx = (rect.x + (place.x + place.width / 2) * s) * DSF;
  const cy = (rect.y + (A4.h - place.y - place.fontSize * 0.3) * s) * DSF;
  const zw = 960, zh = 540; // 2× zoom
  const zx = Math.round(Math.min(Math.max(cx - zw / 2, 0), 1920 - zw));
  const zy = Math.round(Math.min(Math.max(cy - zh / 2, 0), 1080 - zh));
  await page.evaluate(() => { const c = document.getElementById('video-cursor'); if (c) c.style.left = '-40px'; });
  const z0 = cast.now();
  await sleep(4500);
  current.zoom = { from: z0 + 0.6 - current.start, to: z0 + 4.2 - current.start, rect: [zx, zy, zw, zh] };
  const save = page.getByRole('link', { name: 'Save PDF' });
  await pointAt(page, save);
  const [dl] = await Promise.all([page.waitForEvent('download'), save.click()]);
  await dl.saveAs(join(RAW, 'formtwin-filled-form.pdf')); // fictional values; for checking O and 0 in the file
  await sleep(1000);
  await scrollTo(page.getByTestId('print-guidance'));
  await pointAt(page, page.getByTestId('print-guidance'));
  await sleep(4000);

  // Shot 9: End session and clear data → empty; network back on; reload → nothing restored.
  begin(9);
  await click(page, page.getByRole('button', { name: 'End session and clear data' }));
  await sleep(2500);
  await scrollTo(page.getByLabel(/^Family name/), 'start');
  await sleep(3000);
  const online = cast.now();
  await ctx.setOffline(false);
  caption('Network back on for the reload', online, null);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(1200);
  await page.reload();
  await page.getByTestId('boot-status').filter({ hasText: 'ready' }).waitFor({ timeout: 60_000 });
  await ensureCursor(page);
  await sleep(1500);
  const empty = (await page.getByLabel(/^Family name/).inputValue()) === '' && (await page.getByLabel(/^Residence card number/).inputValue()) === '';
  meta.afterReloadEmpty = empty;
  await scrollTo(page.getByLabel(/^Family name/), 'start');
  await sleep(3500);
  current.end = cast.now();
  await cast.stop();
  await ctx.close();
  if (DRY) rmSync(PROFILE, { recursive: true, force: true });

  for (const sh of shots) {
    const name = `shot${String(sh.id).padStart(2, '0')}`;
    const duration = sh.end - sh.start;
    cast.writeClip(sh.start, sh.end, join(RAW, `${name}.mp4`));
    writeFileSync(join(RAW, `${name}.json`), `${JSON.stringify({ duration, waits: sh.waits, captions: sh.captions, zoom: sh.zoom }, null, 2)}\n`);
    meta.shots[sh.id] = { seconds: Math.round(duration * 10) / 10, cutWaits: sh.waits.length };
    log(`${name}.mp4 ${duration.toFixed(1)} s, waits to cut: ${sh.waits.length}`);
  }
  rmSync(frames, { recursive: true, force: true });
  writeFileSync(join(RAW, 'recording.json'), `${JSON.stringify(meta, null, 2)}\n`);
  log(`done: ${RAW} (build ${meta.build}; reload left fields empty: ${empty})`);
}

await main();
