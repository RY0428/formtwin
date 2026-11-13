#!/usr/bin/env node
// Device check on the developer's Mac: drives the developer's installed Google Chrome with Playwright
// against the HOSTED private app, with the real on-device model. Fictional sample images only.
//
//   npm run device:check            # full run (first run also sets flags and downloads the model)
//   npm run device:check -- --skip-download   # stop instead of waiting for a model download
//
// Uses a dedicated Chrome profile (~/.formtwin-device-profile): Chrome does not let automation drive the
// everyday profile. Playwright's default switches that block component/model downloads are not used.
// Output: a summary on the terminal and docs/device-runs/<time>-<build>.json (no personal data).
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const URL_PRIVATE = 'https://formtwin-dev-private.web.app/';
const PROFILE = join(homedir(), '.formtwin-device-profile');
const FLAGS = ['prompt-api-multimodal-input', 'gemma4-for-built-in-ai'];
const IMAGES = ['data/eval/explore/explore-01.png', 'data/eval/explore/explore-02.png', 'data/eval/explore/explore-03.png'];
const SKIP_DOWNLOAD = process.argv.includes('--skip-download');
const FAKE_AI_RUN = process.env.FORMTWIN_DRY_FAKE_AI === '1';
const report = { startedAt: new Date().toISOString(), chrome: null, build: null, flags: {}, steps: [] };
const log = (m) => console.log(`[device-check]${FAKE_AI_RUN ? ' [DRY RUN, fake model]' : ''} ${m}`);
/** Removes local paths (home, profile, working directory) from any text that goes into a report. */
const redact = (t) =>
  t
    .split(PROFILE).join('<profile>')
    .split(process.cwd()).join('<repo>')
    .split(homedir()).join('~')
    .replace(/--user-data-dir=\S+/g, '--user-data-dir=<profile>');
const step = (name, ok, detail = {}) => {
  report.steps.push({ name, ok, ...detail });
  log(`${ok ? 'OK  ' : 'NG  '} ${name} ${Object.keys(detail).length ? JSON.stringify(detail) : ''}`);
};

async function launch() {
  mkdirSync(PROFILE, { recursive: true });
  return chromium.launchPersistentContext(PROFILE, {
    // FORMTWIN_CHROME_PATH / FORMTWIN_HEADLESS: only for a dry run of this script outside the Mac.
    ...(process.env.FORMTWIN_CHROME_PATH ? { executablePath: process.env.FORMTWIN_CHROME_PATH } : { channel: 'chrome' }),
    headless: process.env.FORMTWIN_HEADLESS === '1',
    viewport: null,
    acceptDownloads: true,
    // Only the switches automation needs; Playwright's defaults would block model downloads.
    ignoreDefaultArgs: true,
    args: [
      `--user-data-dir=${PROFILE}`,
      '--remote-debugging-pipe',
      '--no-first-run',
      '--no-default-browser-check',
      ...(process.env.FORMTWIN_HEADLESS === '1' ? ['--headless=new', '--no-sandbox'] : []),
      'about:blank',
    ],
  });
}

async function ensureFlags(wanted = Object.fromEntries(FLAGS.map((f) => [f, 'Enabled']))) {
  let ctx = await launch();
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  let changed = false;
  for (const [flag, label] of Object.entries(wanted)) {
    await page.goto(`chrome://flags/#${flag}`);
    const select = page.locator(`#${flag} select`).first();
    if ((await select.count()) === 0) {
      report.flags[flag] = 'not found';
      continue;
    }
    const current = await select.evaluate((s) => s.options[s.selectedIndex]?.textContent?.trim());
    if (current !== label) {
      await select.selectOption({ label });
      changed = true;
    }
    report.flags[flag] = label;
  }
  if (changed) {
    log('Chrome flags changed; restarting Chrome.');
    await ctx.close();
    ctx = await launch();
  }
  return ctx;
}

// Dry run of this script only (never on the Mac): a stand-in model so the flow can be exercised.
const FAKE_AI = process.env.FORMTWIN_DRY_FAKE_AI === '1';
function installFake() {
  const answer = JSON.stringify({ fields: [{ key: 'fullName', value: 'SANTOS MARIA CLARA' }, { key: 'residenceCardNumber', value: 'JK24681357LM' }, { key: 'periodOfStayExpiry', value: '2026年12月01日' }] });
  let state = 'downloadable';
  window.LanguageModel = {
    availability: () => Promise.resolve(state),
    create: () => new Promise((r) => setTimeout(() => { state = 'available'; r({ prompt: () => new Promise((ok) => setTimeout(() => ok(answer), 800)), destroy() {} }); }, 3000)),
  };
}

// Every request of every page in every Chrome launch of this run (not only the last page).
const foreign = [];
const watched = new WeakSet();
async function openApp(ctx) {
  if (!watched.has(ctx)) {
    watched.add(ctx);
    if (FAKE_AI) await ctx.addInitScript(installFake);
    ctx.on('request', (r) => {
      const u = new URL(r.url());
      if (u.protocol.startsWith('http') && u.origin !== new URL(URL_PRIVATE).origin) foreign.push(r.url());
    });
  }
  for (const old of ctx.pages()) if (old.url().startsWith(URL_PRIVATE)) await old.close();
  const page = await ctx.newPage();
  await page.goto(URL_PRIVATE);
  await page.getByTestId('boot-status').filter({ hasText: 'ready' }).waitFor({ timeout: 60_000 });
  report.build = ((await page.locator('footer').innerText()).match(/Build (\S+)\./) ?? [])[1] ?? 'unknown';
  return { page };
}

const text = (page, id) => page.getByTestId(id).innerText();

async function waitAi(page, timeoutMs) {
  const end = Date.now() + timeoutMs;
  let last = 0;
  for (;;) {
    const s = await text(page, 'ai-status');
    if (s !== 'preparing') return s;
    if (Date.now() > end) return 'preparing (timed out waiting)';
    if (Date.now() - last > 30_000) {
      const p = await page.locator('progress').getAttribute('value').catch(() => null);
      log(`model download in progress: ${p === null ? '?' : Math.round(Number(p) * 100)}%`);
      last = Date.now();
    }
    await page.waitForTimeout(1000);
  }
}

async function main() {
  let ctx = await ensureFlags();
  report.chrome = ctx.browser()?.version() ?? null;
  try {
    // ④ Cancel during preparation (only possible while the model is not installed yet).
    let { page } = await openApp(ctx);
    // A fresh profile can take minutes before Chrome answers LanguageModel.availability().
    let availability = await text(page, 'availability');
    for (let i = 0; availability === 'checking' && i < 5; i += 1) {
      log(`waiting for Chrome to report AI availability (${(i + 1) * 60} s max ${5 * 60} s); reloading the page each minute`);
      for (let j = 0; j < 60 && availability === 'checking'; j += 1) {
        await page.waitForTimeout(1000);
        availability = await text(page, 'availability');
      }
      if (availability === 'checking') {
        ({ page } = await openApp(ctx));
        availability = await text(page, 'availability');
      }
    }
    if (availability === 'checking' && report.flags['gemma4-for-built-in-ai'] === 'Enabled') {
      // Fallback: the Gemma 4 flag in a fresh profile may keep Chrome from answering. Retry without it.
      log('no answer with the Gemma 4 flag; setting it to Default and restarting Chrome');
      report.gemma4FallbackFrom = 'Enabled';
      await ctx.close();
      ctx = await ensureFlags({ 'prompt-api-multimodal-input': 'Enabled', 'gemma4-for-built-in-ai': 'Default' });
      ({ page } = await openApp(ctx));
      for (let j = 0; j < 180 && (availability = await text(page, 'availability')) === 'checking'; j += 1) await page.waitForTimeout(1000);
    }
    if (availability === 'checking') {
      // Diagnostics without personal data: what Chrome reports, and its feature switches.
      report.diagnostics = await page.evaluate(async () => {
        const lm = globalThis.LanguageModel;
        const res = { languageModelGlobal: typeof lm };
        if (lm) {
          res.availabilityPlain = await Promise.race([lm.availability().catch((e) => `error ${e}`), new Promise((r) => setTimeout(() => r('no answer in 10 s'), 10_000))]);
        }
        return res;
      });
      const v = await ctx.newPage();
      await v.goto('chrome://version');
      report.diagnostics.commandLine = redact((await v.locator('#command_line').innerText().catch(() => '')) || '');
      await v.close();
    }
    report.availabilityAtStart = availability;
    if (availability === 'available') {
      step('④ cancel AI preparation', true, { skipped: 'model already installed (preparation is instant)' });
    } else if (availability === 'downloadable' || availability === 'downloading') {
      await page.getByRole('button', { name: 'Prepare AI' }).click();
      await page.getByRole('button', { name: 'Cancel' }).click({ timeout: 10_000 });
      const s1 = await text(page, 'ai-status');
      await page.waitForTimeout(60_000);
      const s2 = await text(page, 'ai-status');
      const reason = await text(page, 'ai-reason').catch(() => '');
      step('④ cancel AI preparation', s1 === 'failed' && s2 === 'failed' && reason === 'cancelled', { after: s1, after60s: s2, reason });
      if (SKIP_DOWNLOAD) throw new Error('model not installed; run again without --skip-download');
      ({ page } = await openApp(ctx));
    } else {
      step('AI availability', false, { availability });
      throw new Error(`on-device AI not usable here: ${availability}`);
    }

    // Prepare (first run downloads the model; this can take tens of minutes).
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Prepare AI' }).click();
    const ai = await waitAi(page, 90 * 60_000);
    step('Prepare AI', ai === 'ready', { status: ai, seconds: Math.round((Date.now() - t0) / 1000) });
    if (ai !== 'ready') throw new Error('AI not ready');

    // ⑤ Extraction on fictional sample images.
    for (const img of IMAGES) {
      await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles(img);
      await page.getByAltText('Selected sample').waitFor();
      const extract = page.getByRole('button', { name: 'Extract on this device' });
      await extract.waitFor();
      for (let i = 0; i < 120 && !(await extract.isEnabled()); i += 1) await page.waitForTimeout(1000);
      const s = Date.now();
      await extract.click();
      const candidates = page.getByRole('button', { name: /^Use / });
      const error = page.getByTestId('error');
      await Promise.race([candidates.first().waitFor({ timeout: 120_000 }), error.waitFor({ timeout: 120_000 })]).catch(() => undefined);
      const code = (await error.count()) > 0 ? await error.innerText() : null;
      step(`⑤ extract ${img.split('/').pop()}`, code === null && (await candidates.count()) > 0, {
        seconds: Math.round((Date.now() - s) / 100) / 10,
        candidates: await candidates.count(),
        error: code,
      });
    }

    // ①–③ with a REAL tab switch (headed Chrome changes visibility).
    await page.getByRole('button', { name: 'End session and clear data' }).click();
    await page.getByLabel(/^Family name/).fill('TANAKA');
    // Real hide: switch to another tab; if the window manager keeps the page visible, minimise the window.
    let method = 'tab switch';
    const other = await ctx.newPage();
    await other.bringToFront();
    await page.waitForTimeout(1500);
    let locked = await page.getByTestId('lock-screen').count() > 0;
    await other.close();
    if (!locked) {
      method = 'window minimise';
      const cdp = await ctx.newCDPSession(page);
      const { windowId } = await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
      await page.waitForTimeout(1500);
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
      locked = await page.getByTestId('lock-screen').count() > 0;
    }
    await page.bringToFront();
    if (locked) await page.getByRole('button', { name: 'Resume' }).click();
    if (locked) {
      step('① hidden page locks; Resume keeps values', (await page.getByLabel(/^Family name/).inputValue()) === 'TANAKA', { method });
    } else {
      // Playwright keeps automated pages "visible" (tab switch and minimise did not hide it on the Mac,
      // 2026-11-13). Not a failure of the app: this step stays a manual device check.
      report.notMeasured = [...(report.notMeasured ?? []), '① hidden page lock (automation keeps the page visible)'];
      log('--   ① hidden page lock: not measurable under automation (manual device check instead)');
    }

    const values = [[/^Given name/, 'HANAKO'], [/^Expiry year/, '2027'], [/^Expiry month/, '3'], [/^Expiry day/, '31'], [/^Residence card number/, 'AB12345678CD']];
    for (const [l, v] of values) await page.getByLabel(l).fill(v);
    for (const c of await page.getByLabel('Checked against my card').all()) await c.check();
    await page.getByRole('button', { name: 'Create PDF' }).click();
    await page.locator('[data-testid="pdf-preview"][data-state="done"]').waitFor({ timeout: 60_000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Save PDF' }).click()]);
    // The download event is the evidence; the file itself is not kept (fictional values).
    const pdfName = dl.suggestedFilename().endsWith('.pdf');
    await dl.cancel().catch(() => undefined);
    step('② Save PDF without lock', pdfName && (await page.getByTestId('lock-screen').count()) === 0, { pdfName });

    await page.getByRole('button', { name: 'End session and clear data' }).click();
    step('③ End session clears values', (await page.getByLabel(/^Family name/).inputValue()) === '' && (await page.getByTestId('pdf-preview').count()) === 0);

    step('no request outside the app origin during the whole run', foreign.length === 0, { foreign });
  } catch (e) {
    report.error = redact(String(e instanceof Error ? e.message : e)).slice(0, 2000);
    log(`stopped: ${report.error}`);
  } finally {
    await ctx.close();
  }
  report.finishedAt = new Date().toISOString();
  if (FAKE_AI) report.dryRunWithFakeModel = 'NOT device evidence';
  // Dry runs (fake model) never go to docs/device-runs: they are not device evidence.
  const dir = FAKE_AI ? join(tmpdir(), 'formtwin-device-dry-runs') : 'docs/device-runs';
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${report.startedAt.replace(/[:.]/g, '-')}-${report.build}${FAKE_AI ? '-DRY-RUN' : ''}.json`);
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  log(`report: ${file}`);
  log(`summary: ${report.steps.map((s) => `${s.name.split(' ')[0]} ${s.ok ? 'OK' : 'NG'}`).join(' / ')}${report.notMeasured ? ` (not measured: ${report.notMeasured.length})` : ''}`);
  process.exitCode = report.error || report.steps.some((s) => !s.ok) ? 1 : 0;
}

await main();
