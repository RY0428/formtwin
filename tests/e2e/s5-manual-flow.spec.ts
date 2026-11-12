import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { installFakeLanguageModel, type FakeOptions } from './fakeLanguageModel.ts';

// S5: manual entry → per-field confirmation → partial PDF, without AI and offline.
// Production-like build (dist-e2e) under the private CSP. Fictional values only.
const ORIGIN = 'http://localhost:4174';

async function pdfText(path: string): Promise<string> {
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), disableFontFace: true });
  const doc = await task.promise;
  const content = await (await doc.getPage(1)).getTextContent();
  const text = content.items.map((i) => ('str' in i ? i.str : '')).join('\n');
  await task.destroy();
  return text;
}

async function open(page: Page) {
  const foreign: string[] = [];
  const csp: string[] = [];
  page.context().on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol !== 'data:' && url.protocol !== 'blob:' && url.origin !== ORIGIN) foreign.push(req.url());
  });
  page.on('console', (m) => {
    if (/Content Security Policy|violates/i.test(m.text())) csp.push(m.text().slice(0, 200));
  });
  await page.goto(`${ORIGIN}/`);
  await expect(page.getByTestId('boot-status')).toHaveText('ready');
  return { foreign, csp };
}

async function fill(page: Page, label: RegExp, value: string, confirm = true) {
  const row = page.locator('div', { has: page.getByLabel(label) }).last();
  await page.getByLabel(label).fill(value);
  if (confirm) await row.getByLabel('Checked against my card').check();
}

test('manual entry without AI, offline, produces a partial PDF with confirmed values only', async ({ page, context }) => {
  const seen = await open(page);
  await page.getByRole('button', { name: 'Continue without AI' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('skipped');

  await context.setOffline(true);

  await fill(page, /^Family name/, 'TANAKA');
  await fill(page, /^Given name/, 'HANAKO');
  await fill(page, /^Expiry year/, '2027');
  await fill(page, /^Expiry month/, '03');
  await fill(page, /^Expiry day/, '31');
  await fill(page, /^Residence card number/, 'AB12345678CD', false); // entered but not checked

  await expect(page.getByTestId('manual-ms')).toHaveText('-'); // card number not checked yet
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByTestId('pdf-ready')).toBeVisible();
  await expect(page.getByTestId('left-blank')).toContainText('Residence card number');
  await expect(page.getByTestId('left-blank')).toContainText('not checked');
  await expect(page.getByText('partially filled')).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Save PDF' }).click()]);
  expect(download.suggestedFilename()).toBe('formtwin-filled-form.pdf');
  const text = await pdfText(await download.path());
  for (const v of ['TANAKA', 'HANAKO', '2027', '31']) expect(text).toContain(v);
  expect(text).not.toContain('AB12345678CD');

  expect(seen.csp).toEqual([]);
  expect(seen.foreign).toEqual([]);

  const row = page.locator('div', { has: page.getByLabel(/^Residence card number/) }).last();
  await row.getByLabel('Checked against my card').check();
  await expect(page.getByTestId('manual-ms')).toHaveText(/^\d+ ms$/);
});

test('editing after PDF creation withdraws the confirmation and invalidates the PDF', async ({ page }) => {
  await open(page);
  await fill(page, /^Family name/, 'TANAKA');
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByRole('link', { name: 'Save PDF' })).toBeVisible();

  await page.getByLabel(/^Family name/).fill('TANAKAA');
  await expect(page.getByRole('link', { name: 'Save PDF' })).toHaveCount(0);
  const row = page.locator('div', { has: page.getByLabel(/^Family name/) }).last();
  await expect(row.getByLabel('Checked against my card')).not.toBeChecked();
});

test('AI candidates are applied only on request and stay unconfirmed', async ({ page }) => {
  const fake: FakeOptions = {
    availability: 'available',
    response: JSON.stringify({
      fields: [
        { key: 'fullName', value: 'SANTOS MARIA CLARA' },
        { key: 'residenceCardNumber', value: 'JK24681357LM' },
        { key: 'periodOfStayExpiry', value: '2026年12月01日' },
      ],
    }),
  };
  await page.addInitScript(installFakeLanguageModel, fake);
  await open(page);
  await page.getByRole('button', { name: 'Prepare AI' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('ready');
  await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles('data/eval/explore/explore-03.png');
  await page.getByRole('button', { name: 'Extract on this device' }).click();
  await expect(page.getByTestId('result')).toContainText('SANTOS MARIA CLARA');

  // Nothing written yet.
  await expect(page.getByLabel(/^Family name/)).toHaveValue('');
  // Two split options offered; the person chooses.
  await expect(page.getByRole('button', { name: /^Use name:/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'Use name: family “SANTOS”, given “MARIA CLARA”' }).click();
  await page.getByRole('button', { name: /^Use expiry: 2026 \/ 12 \/ 01/ }).click();

  await expect(page.getByLabel(/^Family name/)).toHaveValue('SANTOS');
  await expect(page.getByLabel(/^Given name/)).toHaveValue('MARIA CLARA');
  await expect(page.getByLabel(/^Expiry day/)).toHaveValue('01');
  await expect(page.getByLabel(/^Residence card number/)).toHaveValue('');
  for (const label of [/^Family name/, /^Given name/, /^Expiry year/]) {
    const row = page.locator('div', { has: page.getByLabel(label) }).last();
    await expect(row.getByLabel('Checked against my card')).not.toBeChecked();
  }
});

test('ending the session clears values', async ({ page }) => {
  await open(page);
  await fill(page, /^Family name/, 'TANAKA');
  await page.getByRole('button', { name: 'End session and clear data' }).click();
  await expect(page.getByLabel(/^Family name/)).toHaveValue('');
  await expect(page.getByText('have been cleared from this app')).toBeVisible();
});
