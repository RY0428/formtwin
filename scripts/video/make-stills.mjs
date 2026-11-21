#!/usr/bin/env node
// Stills for the demo video (shots 1, 2 and 10), 1920×1080 PNG, rendered from HTML with Playwright.
//
//   node scripts/video/make-stills.mjs [--out ~/formtwin-video]
//
// Shot 1 uses page 1 of the official blank form (forms/sources/930004094.pdf, PDL 1.0), rasterised with
// pdftoppm (poppler) or, on macOS without poppler, with `sips`. Shot 10 numbers come from
// docs/eval/release3-results.md (latest judged run); keep them in sync if that file changes.
// Output stays outside the repository (video files are not committed).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const argOut = process.argv.indexOf('--out');
const OUT = resolve(argOut >= 0 ? process.argv[argOut + 1] : join(homedir(), 'formtwin-video'));
const STILLS = join(OUT, 'stills');
mkdirSync(STILLS, { recursive: true });

const has = (cmd) => {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

/** Page 1 of the blank official form as PNG (about 1600 px tall). */
function formPage() {
  const png = join(STILLS, 'form-p1.png');
  const pdf = resolve('forms/sources/930004094.pdf');
  if (has('pdftoppm')) {
    execFileSync('pdftoppm', ['-f', '1', '-l', '1', '-png', '-singlefile', '-scale-to-y', '1600', '-scale-to-x', '-1', pdf, png.replace(/\.png$/, '')]);
  } else if (has('sips')) {
    // sips renders the first page of a PDF.
    execFileSync('sips', ['-s', 'format', 'png', '-Z', '1600', pdf, '--out', png], { stdio: 'ignore' });
  } else {
    throw new Error('need pdftoppm (brew install poppler) or macOS sips to rasterise the form');
  }
  return png;
}

const CSS = `
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1920px; height: 1080px; }
  body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, "DejaVu Sans", sans-serif;
         background: #f6f7f9; color: #0f172a; overflow: hidden; }
  .mono { font-family: "SF Mono", Menlo, "DejaVu Sans Mono", monospace; }
  .chip { display: inline-block; padding: 8px 18px; border-radius: 999px; font-size: 28px; font-weight: 600; }
  .cloud { background: #dbeafe; color: #1e3a8a; }
  .hybrid { background: #ede9fe; color: #4c1d95; }
  .device { background: #d1fae5; color: #065f46; }
  .muted { color: #475569; }
`;

const shot1 = (formDataUrl) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
  body { display: grid; grid-template-columns: 1fr 820px; }
  .left { padding: 140px 0 0 140px; }
  h1 { font-size: 132px; letter-spacing: -2px; }
  h2 { font-size: 58px; font-weight: 500; margin-top: 24px; line-height: 1.2; }
  .who { font-size: 34px; margin-top: 64px; line-height: 1.45; max-width: 860px; }
  .credit { position: absolute; left: 140px; bottom: 64px; font-size: 22px; }
  .form { margin-top: 70px; height: 1010px; justify-self: start; background: white;
          box-shadow: 0 20px 60px rgba(15,23,42,.18); border-radius: 6px; overflow: hidden; }
  .form img { height: 100%; display: block; }
</style></head><body>
  <div class="left">
    <h1>FormTwin</h1>
    <h2>Fill official forms<br>with on-device AI</h2>
    <p class="who muted">For foreign residents in Japan:<br>Application for Extension of Period of Stay, page 1.</p>
  </div>
  <div class="form"><img src="${formDataUrl}" alt=""></div>
  <p class="credit muted">Blank form: Immigration Services Agency of Japan (Public Data License 1.0)</p>
</body></html>`;

const row = (feature, data, chip, chipClass, note) => `
  <div class="row">
    <div><div class="feature">${feature}</div><div class="data muted">${data}</div></div>
    <div class="mode"><span class="chip ${chipClass}">${chip}</span><div class="note muted">${note}</div></div>
  </div>`;

const shot2 = () => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
  body { padding: 90px 120px; }
  h1 { font-size: 64px; }
  .sub { font-size: 32px; margin-top: 14px; }
  .apps { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 60px; }
  .app { background: white; border-radius: 20px; padding: 40px 44px; box-shadow: 0 8px 30px rgba(15,23,42,.08);
         border: 2px solid #e2e8f0; }
  .app.private { border-color: #6ee7b7; }
  .app h3 { font-size: 38px; }
  .app .origin { font-size: 24px; margin-top: 6px; }
  .row { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: start; padding: 30px 0 0; }
  .row + .row { border-top: 1px solid #e2e8f0; margin-top: 30px; }
  .feature { font-size: 34px; font-weight: 600; }
  .data { font-size: 26px; margin-top: 8px; }
  .mode { text-align: right; }
  .note { font-size: 22px; margin-top: 10px; }
  .sdk { margin-top: 56px; text-align: center; font-size: 34px; }
  .sdk b { color: #b45309; }
</style></head><body>
  <h1>Hybrid by data sensitivity</h1>
  <p class="sub muted">Two separate web apps · three AI features · one SDK</p>
  <div class="apps">
    <div class="app">
      <h3>Public app</h3><p class="origin muted mono">formtwin-dev.web.app</p>
      ${row('Analyse the blank official form', 'Public data', 'Cloud only', 'cloud', 'ONLY_IN_CLOUD · App Check')}
      ${row('Explain each form field', 'Public data', 'Cloud first', 'hybrid', 'PREFER_IN_CLOUD · automatic<br>on-device fallback')}
    </div>
    <div class="app private">
      <h3>Personal-entry app</h3><p class="origin muted mono">formtwin-dev-private.web.app</p>
      ${row('Read the residence card', 'Personal data', 'On-device only', 'device', 'ONLY_ON_DEVICE · Chrome built-in model<br>no cloud fallback by design')}
      <p class="data muted" style="margin-top:36px">The page's security policy blocks network connections.<br>Values live in memory only.</p>
    </div>
  </div>
  <p class="sdk">All inference through the <b>Firebase AI Logic</b> Web SDK</p>
</body></html>`;

// Numbers: docs/eval/release3-results.md (judged once, 2026-11-14). Do not round in the app's favour.
const shot10 = () => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
  body { padding: 100px 140px; }
  h1 { font-size: 64px; }
  .sub { font-size: 30px; margin-top: 14px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 36px; margin-top: 64px; }
  .card { background: white; border-radius: 20px; padding: 40px 36px; border: 2px solid #e2e8f0; }
  .card.pass { border-color: #6ee7b7; }
  .card.miss { border-color: #fcd34d; }
  .label { font-size: 30px; font-weight: 600; }
  .big { font-size: 96px; font-weight: 700; margin-top: 18px; letter-spacing: -1px; }
  .what { font-size: 26px; margin-top: 8px; line-height: 1.4; }
  .verdict { margin-top: 26px; font-size: 26px; font-weight: 600; }
  .pass .verdict { color: #047857; }
  .miss .verdict { color: #b45309; }
  .foot { margin-top: 56px; font-size: 24px; line-height: 1.5; }
</style></head><body>
  <h1>Honest results</h1>
  <p class="sub muted">20 unused fictional cards · thresholds frozen before the cards were made · judged once</p>
  <div class="grid">
    <div class="card pass"><div class="label">Name</div><div class="big">18/20</div>
      <div class="what muted">read exactly (bar ≥ 16)</div><div class="verdict">Passed</div></div>
    <div class="card pass"><div class="label">Expiry date</div><div class="big">18/18</div>
      <div class="what muted">read exactly (bar ≥ 17)</div><div class="verdict">Passed</div></div>
    <div class="card miss"><div class="label">Card number</div><div class="big">4/18</div>
      <div class="what muted">must be typed by hand (bar ≤ 3)</div>
      <div class="what"><b>0/18</b> <span class="muted" style="white-space:nowrap">wrong numbers offered for one-click use</span></div>
      <div class="verdict">Missed our bar — kept on record</div></div>
  </div>
  <p class="foot muted">Latest run (release3, 2026-11-14), Chrome on-device model. Every value still needs your check.
    Details: docs/eval/release3-results.md</p>
</body></html>`;

async function launchBrowser() {
  if (process.env.FORMTWIN_CHROME_PATH) return chromium.launch({ executablePath: process.env.FORMTWIN_CHROME_PATH });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: 'chrome' }); // Mac without Playwright's own browser
  }
}

const png = formPage();
const formDataUrl = `data:image/png;base64,${readFileSync(png).toString('base64')}`;
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
for (const [name, html] of [['shot01', shot1(formDataUrl)], ['shot02', shot2()], ['shot10', shot10()]]) {
  await page.setContent(html, { waitUntil: 'load' });
  const file = join(STILLS, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`[stills] ${file}`);
}
await browser.close();
