#!/usr/bin/env node
// Device check on the developer's Mac: drives the developer's installed Google Chrome with Playwright
// against the HOSTED private app, with the real on-device model. Fictional sample images only.
//
//   npm run device:check            # full run (first run also sets flags and downloads the model)
//   npm run device:check -- --skip-download   # stop instead of waiting for a model download
//   npm run device:check -- --inactivity      # also wait for the real 9/10-minute inactivity end (about 11 min)
//   npm run device:check -- --explain-only    # only the public field explanations (online, offline), with request diagnostics
//
// Uses a dedicated Chrome profile (~/.formtwin-device-profile): Chrome does not let automation drive the
// everyday profile. Playwright's default switches that block component/model downloads are not used.
// Output: a summary on the terminal and docs/device-runs/<time>-<build>.json (no personal data).
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const URL_PRIVATE = 'https://formtwin-dev-private.web.app/';
const URL_PUBLIC = 'https://formtwin-dev.web.app/';
const PROFILE = join(homedir(), '.formtwin-device-profile');
const FLAGS = ['prompt-api-multimodal-input', 'gemma4-for-built-in-ai'];
const IMAGES = ['data/eval/explore/explore-01.png', 'data/eval/explore/explore-02.png', 'data/eval/explore/explore-03.png'];
const SKIP_DOWNLOAD = process.argv.includes('--skip-download');
const EXPLAIN_ONLY = process.argv.includes('--explain-only');
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
      // Only pages of the private app count: the public app legitimately calls Firebase and reCAPTCHA.
      let pageUrl;
      try {
        // A request with no page (worker, closed page) counts, to stay on the safe side.
        pageUrl = r.frame().page()?.url() ?? URL_PRIVATE;
      } catch {
        pageUrl = URL_PRIVATE; // no frame (e.g. a worker): count it, to stay on the safe side
      }
      if (!pageUrl.startsWith(URL_PRIVATE)) return;
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

/** Thrown after an evaluation run to skip the regular steps (not an error). */
async function checkExplanations(ctx) {
  // Public field explanations (hybrid, PREFER_IN_CLOUD): cloud first, then the automatic on-device
  // fallback with the network off. The model is already installed in this profile by the steps above.
  const pub = await ctx.newPage();
  // Diagnostics (public app only, no personal data): Google API / App Check / reCAPTCHA responses
  // (host, path without query, status) and console warnings and errors.
  const net = [];
  const consoleMsgs = [];
  pub.on('response', (r) => {
    const u = new URL(r.url());
    if (/googleapis\.com$|recaptcha|gstatic/.test(u.hostname) || u.hostname.endsWith('google.com')) {
      net.push({ host: u.hostname, path: u.pathname.slice(0, 160), status: r.status() });
    }
  });
  pub.on('requestfailed', (r) => {
    const u = new URL(r.url());
    net.push({ host: u.hostname, path: u.pathname.slice(0, 160), failed: (r.failure()?.errorText ?? '').slice(0, 80) });
  });
  pub.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`${m.type()}: ${redact(m.text()).slice(0, 400)}`);
  });
  await pub.goto(URL_PUBLIC);
  const explainOnce = async () => {
    await pub.getByRole('button', { name: 'Explain fields' }).click();
    await Promise.race([
      pub.getByTestId('explain-source').waitFor({ timeout: 90_000 }),
      pub.getByTestId('explain-error').waitFor({ timeout: 90_000 }),
    ]).catch(() => undefined);
    const src = (await pub.getByTestId('explain-source').count()) > 0 ? await pub.getByTestId('explain-source').innerText() : null;
    const err = (await pub.getByTestId('explain-error').count()) > 0 ? await pub.getByTestId('explain-error').innerText() : null;
    return { source: src, error: err, items: await pub.getByTestId('explain-item').count() };
  };
  const deployed = await pub
    .getByRole('button', { name: 'Explain fields' })
    .waitFor({ timeout: 20_000 })
    .then(() => true, () => false);
  if (!deployed) throw new Error('the hosted public app has no "Explain fields" yet (deploy the current build)');
  report.publicBuild = ((await pub.getByText(/build [0-9a-f]{7}/).innerText().catch(() => '')).match(/build (\S+)/) ?? [])[1] ?? 'unknown';
  const online = await explainOnce();
  report.explainDiagnostics = { online: { requests: net.splice(0), console: consoleMsgs.splice(0) } };
  step('explanations online answered in the cloud', online.source === 'In the cloud' && online.items > 0, online);
  await ctx.setOffline(true);
  const offline = await explainOnce();
  await ctx.setOffline(false);
  report.explainDiagnostics.offline = { requests: net.splice(0), console: consoleMsgs.splice(0) };
  step('explanations offline fell back to this device', (offline.source ?? '').startsWith('On this device') && offline.items > 0, offline);
  await pub.close();
}

const EVAL_DONE = Symbol('eval done');
async function main() {
  let ctx = await ensureFlags();
  report.chrome = ctx.browser()?.version() ?? null;
  try {
    if (EXPLAIN_ONLY) {
      await checkExplanations(ctx);
      throw EVAL_DONE;
    }
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

    // Evaluation mode (docs/eval/release-protocol.md §6): judge a set once and stop.
    const evalIdx = process.argv.indexOf('--eval');
    if (evalIdx >= 0) {
      const setName = process.argv[evalIdx + 1];
      if (!/^(release|release2|release3|explore|explore2)$/.test(setName ?? '')) throw new Error('--eval needs a set name (release3, or explore2 for an exploration run)');
      const { runEvaluation } = await import('./eval-run.mjs');
      const out = await runEvaluation({ page, setName, log });
      const date = new Date().toISOString().slice(0, 10);
      const results = {
        set: setName,
        run: `${setName}-${date}-mac`,
        note: setName.startsWith('explore')
          ? `Exploration run by device:check --eval ${setName} (not a judgement).`
          : `Automated run by device:check --eval ${setName} (docs/eval/${setName}-protocol.md). Judge once.`,
        environment: {
          url: URL_PRIVATE,
          profile: 'device:check dedicated profile',
          chrome: report.chrome,
          build: report.build,
          flags: report.flags,
          sdk: 'firebase 13.3.0',
          device: 'developer Mac',
        },
        warmUp: out.warmUp,
        runs: out.runs,
        pdfChecks: out.pdfChecks,
      };
      mkdirSync('data/eval/results', { recursive: true });
      const file = join('data/eval/results', `${results.run}.json`);
      if (FAKE_AI) log('DRY RUN: evaluation results are not written');
      else writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
      const misfills = out.pdfChecks.reduce((n, p) => n + (p.misfills?.length ?? 0), 0);
      step(`evaluation ${setName}: ${out.runs.length} cards`, true, { results: FAKE_AI ? '(dry run)' : file, pdfMisfills: misfills });
      throw EVAL_DONE; // skip the regular steps; the report is still written below
    }

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
    // Headless dry runs have no real window: minimising there can break the page target.
    if (!locked && process.env.FORMTWIN_HEADLESS !== '1') {
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
    if (process.env.FORMTWIN_HEADLESS === '1') {
      // Headless dry runs only: a blob download intermittently closes the page there. The Mac run covers it.
      report.notMeasured = [...(report.notMeasured ?? []), '② Save PDF download (headless dry run)'];
    } else {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Save PDF' }).click()]);
      // The download event is the evidence; the file itself is not kept (fictional values).
      const pdfName = dl.suggestedFilename().endsWith('.pdf');
      // Not cancelled: cancelling a finished blob download can close the page in some Chrome builds.
      step('② Save PDF without lock', pdfName && (await page.getByTestId('lock-screen').count()) === 0, { pdfName });
    }

    await page.getByRole('button', { name: 'End session and clear data' }).click();
    step('③ End session clears values', (await page.getByLabel(/^Family name/).inputValue()) === '' && (await page.getByTestId('pdf-preview').count()) === 0);

    // ⑥ Network off: extraction and PDF still work (the private app needs no network after loading).
    await ctx.setOffline(true);
    await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles(IMAGES[2]);
    await page.getByAltText('Selected sample').waitFor();
    const ex = page.getByRole('button', { name: 'Extract on this device' });
    for (let i = 0; i < 120 && !(await ex.isEnabled()); i += 1) await page.waitForTimeout(1000);
    await ex.click();
    const cand = page.getByRole('button', { name: /^Use / });
    await cand.first().waitFor({ timeout: 120_000 }).catch(() => undefined);
    const offlineCandidates = await cand.count();
    for (const [l, v] of [[/^Family name/, 'TANAKA'], ...values]) await page.getByLabel(l).fill(v);
    for (const c of await page.getByLabel('Checked against my card').all()) await c.check();
    await page.getByRole('button', { name: 'Create PDF' }).click();
    const offlinePdf = await page
      .locator('[data-testid="pdf-preview"][data-state="done"]')
      .waitFor({ timeout: 60_000 })
      .then(() => true, () => false);
    await ctx.setOffline(false);
    step('⑥ network off: extraction and PDF still work', offlineCandidates > 0 && offlinePdf, { candidates: offlineCandidates, pdf: offlinePdf });

    // ⑦ Reload: nothing is restored (memory only).
    await page.reload();
    await page.getByTestId('boot-status').filter({ hasText: 'ready' }).waitFor({ timeout: 60_000 });
    step('⑦ reload restores no values', (await page.getByLabel(/^Family name/).inputValue()) === '');

    // ⑧ Back/forward: a page restored from the back/forward cache starts a new session.
    await page.getByRole('button', { name: 'Continue without AI' }).click().catch(() => undefined);
    await page.getByLabel(/^Family name/).fill('TANAKA');
    await page.goto('about:blank');
    await page.goBack({ waitUntil: 'commit' }); // a bfcache restore fires no load event
    await page.getByTestId('boot-status').filter({ hasText: 'ready' }).waitFor({ timeout: 60_000 });
    const afterBack = await page.getByLabel(/^Family name/).inputValue();
    const restoredMsg = (await page.getByTestId('ended-reason').count()) > 0 ? 'bfcache restore → new session' : 'page reloaded (no bfcache)';
    step('⑧ back/forward shows no previous values', afterBack === '', { how: restoredMsg });

    // Optional: real-time inactivity (about 10 minutes; Playwright keeps the page visible and timers run).
    if (process.argv.includes('--inactivity')) {
      await page.getByLabel(/^Family name/).fill('TANAKA');
      log('waiting about 9 minutes for the inactivity warning (do not touch the window)');
      const warned = await page.getByTestId('inactivity-warning').waitFor({ timeout: 9.5 * 60_000 }).then(() => true, () => false);
      const ended = await page.getByTestId('ended-reason').waitFor({ timeout: 2 * 60_000 }).then(() => true, () => false);
      step('inactivity: warning at 9 min, end and clear at 10 min (real time)', warned && ended && (await page.getByLabel(/^Family name/).inputValue()) === '', { warned, ended });
    } else {
      report.notMeasured = [...(report.notMeasured ?? []), 'inactivity 9/10 min (run with --inactivity, about 11 min)'];
    }

    step('private app: no request outside its origin during the whole run', foreign.length === 0, { foreign });

    await checkExplanations(ctx);

  } catch (e) {
    if (e !== EVAL_DONE) {
      report.error = redact(String(e instanceof Error ? e.message : e)).slice(0, 2000);
      if (process.env.FORMTWIN_DEBUG === "1") console.error(e);
      log(`stopped: ${report.error}`);
    }
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
