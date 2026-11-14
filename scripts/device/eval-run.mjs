// Release/gate evaluation run on the developer's Mac (docs/eval/release-protocol.md §6), driven by
// `npm run device:check -- --eval <set>`. Fictional synthetic cards only. Writes a results file in the
// scoring format (scripts/eval/score.mjs) plus per-card PDF checks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const KEYS = ['fullName', 'residenceCardNumber', 'periodOfStayExpiry'];

async function pdfPage1Text(path) {
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), disableFontFace: true });
  const doc = await task.promise;
  const content = await (await doc.getPage(1)).getTextContent();
  const text = content.items.map((i) => ('str' in i ? i.str : '')).join('\n');
  await task.destroy();
  return text;
}

const msOf = async (page) => {
  const t = ((await page.getByTestId('extract-ms').textContent().catch(() => '')) ?? '').match(/(\d+) ms/);
  return t ? Number(t[1]) : null;
};

/** One extraction: returns { fields, extractMs, timedOut, error }. */
async function extractOnce(page, file) {
  await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles(file);
  await page.getByAltText('Selected sample').waitFor();
  const ex = page.getByRole('button', { name: 'Extract on this device' });
  for (let i = 0; i < 120 && !(await ex.isEnabled()); i += 1) await page.waitForTimeout(1000);
  await ex.click();
  const result = page.getByTestId('result');
  const error = page.getByTestId('error');
  await Promise.race([result.waitFor({ timeout: 60_000 }), error.waitFor({ timeout: 60_000 })]).catch(() => undefined);
  if ((await error.count()) > 0) {
    const code = await error.innerText();
    return { fields: null, extractMs: null, timedOut: code === 'timeout', error: code };
  }
  const fields = {};
  const dts = await result.locator('dt').allInnerTexts();
  const dds = await result.locator('dd').allInnerTexts();
  dts.forEach((k, i) => {
    if (KEYS.includes(k)) fields[k] = dds[i] === '(not read)' ? null : dds[i];
  });
  return { fields, extractMs: await msOf(page), timedOut: false, error: null };
}

/** Apply every offered candidate, check every value, create the PDF and compare page-1 text. */
async function pdfCheck(page) {
  for (const name of [/^Use name/, /^Use expiry/, /^Use card number/]) {
    const b = page.getByRole('button', { name }).first();
    if ((await b.count()) > 0) await b.click();
  }
  const values = {};
  for (const [id, label] of [
    ['familyName', /^Family name/],
    ['givenName', /^Given name/],
    ['expiryYear', /^Expiry year/],
    ['expiryMonth', /^Expiry month/],
    ['expiryDay', /^Expiry day/],
    ['residenceCardNumber', /^Residence card number/],
  ]) {
    values[id] = await page.getByLabel(label).inputValue();
  }
  for (const c of await page.getByLabel('Checked against my card').all()) if (await c.isEnabled()) await c.check();
  await page.getByRole('button', { name: 'Create PDF' }).click();
  const done = await page
    .locator('[data-testid="pdf-preview"][data-state="done"]')
    .waitFor({ timeout: 60_000 })
    .then(() => true, () => false);
  if (!done) return { pdf: false, misfills: null };
  // Headless dry runs: a blob download can close the page there (see device-check.mjs); skip the file check.
  if (process.env.FORMTWIN_HEADLESS === '1') return { pdf: true, misfills: null };
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Save PDF' }).click()]);
  const text = await pdfPage1Text(await dl.path());
  // Mis-fill: a value checked in the form that is not in the PDF text (month/day may be printed without a leading zero).
  const misfills = Object.entries(values)
    .filter(([, v]) => v !== '')
    .filter(([id, v]) => !(text.includes(v) || (id.startsWith('expiry') && text.includes(String(Number(v))))))
    .map(([id]) => id);
  return { pdf: true, misfills };
}

export async function runEvaluation({ page, setName, log }) {
  const manifest = JSON.parse(readFileSync(join('data/eval', setName, 'manifest.json'), 'utf8'));
  // Warm-up with an exploration card (protocol §4), not counted.
  const warm = await extractOnce(page, 'data/eval/explore/explore-01.png');
  log(`warm-up: ${warm.extractMs ?? warm.error} ms`);
  const runs = [];
  const pdfChecks = [];
  for (const c of manifest.cases) {
    await page.getByRole('button', { name: 'End session and clear data' }).click();
    const r = await extractOnce(page, join('data/eval', setName, c.file));
    runs.push({ file: c.file, extractMs: r.extractMs, timedOut: r.timedOut, fields: r.fields, error: r.error, pageFirstRun: false });
    const pc = r.fields ? await pdfCheck(page) : { pdf: false, misfills: null };
    pdfChecks.push({ file: c.file, ...pc });
    log(`${c.file}: ${r.error ?? JSON.stringify(r.fields)} ${r.extractMs ?? '-'} ms; PDF misfills ${pc.misfills ? pc.misfills.length : '-'}`);
  }
  return { warmUp: { file: 'explore-01.png', extractMs: warm.extractMs }, runs, pdfChecks };
}
