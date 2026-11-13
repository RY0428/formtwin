// Spike C visual check: fill the dummy form with FICTIONAL values, then render page 1
// with pdf.js in Chromium (Playwright) and save PNGs for review.
// Usage: node scripts/spike-c/render-check.mjs [official] [--pdf-only]
//   official   use the official form 930004094.pdf instead of the dummy form
//   --pdf-only write the filled PDFs only (no browser needed; for print checks)
// Node 24 runs the .ts module via type stripping. Rendering needs Playwright's Chromium.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fillPdf } from '../../apps/private-app/src/pii/fill/fillPdf.ts';

const require = createRequire(import.meta.url);
const assets = new URL('../../apps/private-app/assets/', import.meta.url);
const out = new URL('../../docs/spikes/spike-c/', import.meta.url);
const official = process.argv.includes('official');
const pdfOnly = process.argv.includes('--pdf-only');
const template = new Uint8Array(
  readFileSync(official ? new URL('../../forms/sources/930004094.pdf', import.meta.url) : new URL('forms/dummy-form.pdf', assets)),
);
const font = new Uint8Array(readFileSync(new URL('fonts/BIZUDGothic-Regular.ttf', assets)));
const layout = JSON.parse(
  readFileSync(new URL(official ? 'forms/official/930004094.layout.json' : 'forms/dummy-form.layout.json', assets), 'utf8'),
);

const cases = official
  ? {
      'official-p1': {
        familyName: 'TANAKA', givenName: 'HANAKO', expiryYear: '2027', expiryMonth: '03', expiryDay: '31',
        residenceCardNumber: 'AB12345678CD',
      },
    }
  : {
  'filled-normal': {
    nameKanji: '山田 花子', nameRoman: 'YAMADA HANAKO', expiry: '2027年03月31日',
    residenceCardNumber: 'AB12345678CD', address: '東京都千代田区霞が関１－１－１　髙﨑テストハイツ１０１号室', familyInJapan: true,
  },
  'filled-overflow': {
    nameKanji: '長谷川 結衣', nameRoman: 'MONTGOMERY-WHITTINGTON ALEXANDRA VICTORIA ELIZABETH CHARLOTTE',
    expiry: '2028年11月15日', familyInJapan: false,
  },
};

const pdfjsDir = require.resolve('pdfjs-dist/package.json').replace(/package\.json$/, '');
const filled = {};
for (const [name, values] of Object.entries(cases)) {
  const { bytes, notFilled } = await fillPdf({ template, font, layout, values });
  writeFileSync(new URL(`${name}.pdf`, out), bytes);
  filled[name] = bytes;
  console.log(`${name}.pdf`, 'bytes', bytes.length, 'notFilled', JSON.stringify(notFilled));
}
if (pdfOnly) process.exit(0);

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1800 }, deviceScaleFactor: 1 });
const files = {
  '/pdf.mjs': [readFileSync(pdfjsDir + 'build/pdf.mjs'), 'text/javascript'],
  '/pdf.worker.mjs': [readFileSync(pdfjsDir + 'build/pdf.worker.mjs'), 'text/javascript'],
  '/': [Buffer.from('<!doctype html><canvas id="c"></canvas>'), 'text/html'],
};
for (const [name, bytes] of Object.entries(filled)) {
  files['/doc.pdf'] = [Buffer.from(bytes), 'application/pdf'];
  await page.route('http://spike.local/**', (route) => {
    const f = files[new URL(route.request().url()).pathname];
    return f ? route.fulfill({ body: f[0], contentType: f[1] }) : route.fulfill({ status: 404 });
  });
  await page.goto('http://spike.local/');
  await page.evaluate(async () => {
    const pdfjs = await import('http://spike.local/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'http://spike.local/pdf.worker.mjs';
    const doc = await pdfjs.getDocument({ url: 'http://spike.local/doc.pdf' }).promise;
    const p = await doc.getPage(1);
    const vp = p.getViewport({ scale: 2 });
    const canvas = document.getElementById('c');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await p.render({ canvas, viewport: vp }).promise;
  });
  await page.locator('#c').screenshot({ path: new URL(`${name}.png`, out).pathname });
  await page.unroute('http://spike.local/**');
  console.log(`${name}.png written`);
}
await browser.close();
