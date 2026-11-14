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
  await expect(page.getByTestId('pdf-preview')).toHaveAttribute('data-state', 'done');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Save PDF' }).click()]);
  expect(download.suggestedFilename()).toBe('formtwin-filled-form.pdf');
  // Printing and hand-signature guidance (requirements §9, secondary sources; not asserted as a rule).
  await expect(page.getByTestId('print-guidance')).toContainText('signed by hand');
  await expect(page.getByTestId('print-guidance')).toContainText('does not fill in the signature or the date');
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
  await expect(page.getByTestId('pdf-preview')).toHaveCount(0);
  await expect(page.getByText('Values changed. Create the PDF again.')).toBeVisible();
  const row = page.locator('div', { has: page.getByLabel(/^Family name/) }).last();
  await expect(row.getByLabel('Checked against my card')).not.toBeChecked();
  await page.getByRole('button', { name: 'End session and clear data' }).click();
  await expect(page.getByText('Values changed. Create the PDF again.')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Save PDF' })).toHaveCount(0);
  await expect(page.getByLabel(/^Family name/)).toHaveValue('');
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

test('placeholder "null" is shown as not read; suspicious candidates carry warnings', async ({ page }) => {
  const fake: FakeOptions = {
    availability: 'available',
    response: JSON.stringify({
      fields: [
        { key: 'fullName', value: 'SANTOS JOÃO PEDRO' },
        { key: 'residenceCardNumber', value: 'GP314159260R' },
        { key: 'periodOfStayExpiry', value: 'null' },
      ],
    }),
  };
  await page.addInitScript(installFakeLanguageModel, fake);
  await open(page);
  await page.getByRole('button', { name: 'Prepare AI' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('ready');
  await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles('data/eval/explore/explore-01.png');
  await page.getByRole('button', { name: 'Extract on this device' }).click();
  await expect(page.getByTestId('result')).toContainText('(not read)');
  await expect(page.getByRole('button', { name: /^Use expiry/ })).toHaveCount(0);
  await expect(page.getByTestId('name-warning')).toContainText('accented or non-Latin');
  await expect(page.getByTestId('number-warning')).toContainText('2 letters, 8 digits, 2 letters');
  await expect(page.getByTestId('number-warning')).toContainText('Type it from your card');
  // A number that breaks the format is not offered for one-click adoption (release evaluation, option A).
  await expect(page.getByRole('button', { name: /^Use card number/ })).toHaveCount(0);
});

test('a late extraction result is discarded after the image changes; typed values are never overwritten', async ({
  page,
}) => {
  const fake: FakeOptions = {
    availability: 'available',
    delayMs: 1500,
    response: JSON.stringify({
      fields: [
        { key: 'fullName', value: 'LATE RESULT' },
        { key: 'residenceCardNumber', value: 'ZZ00000000ZZ' },
        { key: 'periodOfStayExpiry', value: null },
      ],
    }),
  };
  await page.addInitScript(installFakeLanguageModel, fake);
  await open(page);
  await page.getByRole('button', { name: 'Prepare AI' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('ready');
  await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles('data/eval/explore/explore-01.png');
  await page.getByRole('button', { name: 'Extract on this device' }).click();
  await page.getByLabel(/^Family name/).fill('TYPED');
  // Replace the image while the first request is still running.
  await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles('data/eval/explore/explore-02.png');
  await page.waitForTimeout(2200);
  await expect(page.getByTestId('result')).toHaveCount(0);
  await expect(page.getByText('LATE RESULT')).toHaveCount(0);
  await expect(page.getByLabel(/^Family name/)).toHaveValue('TYPED');
  // A fresh request for the new image is accepted and still applies nothing by itself.
  await page.getByRole('button', { name: 'Extract on this device' }).click();
  await expect(page.getByTestId('result')).toContainText('LATE RESULT');
  await expect(page.getByLabel(/^Family name/)).toHaveValue('TYPED');
});

for (const how of ['select-last-and-type', 'insertText', 'backspace-then-type', 'ime-composition'] as const) {
  test(`editing a candidate-filled, checked field withdraws its check (${how})`, async ({ page }) => {
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
    await page.getByRole('button', { name: 'Use name: family “SANTOS”, given “MARIA CLARA”' }).click();
    const input = page.getByLabel(/^Given name/);
    const row = page.locator('div', { has: input }).last();
    const check = row.getByLabel('Checked against my card');
    await check.check();
    await expect(check).toBeChecked();
    await input.click();
    await page.keyboard.press('End');
    if (how === 'select-last-and-type') {
      await page.keyboard.press('Shift+ArrowLeft');
      await page.keyboard.type('e');
    } else if (how === 'insertText') {
      await page.keyboard.insertText('e');
    } else if (how === 'backspace-then-type') {
      await page.keyboard.press('Backspace');
      await page.keyboard.type('e');
    } else {
      await input.evaluate((el) => {
        const i = el as HTMLInputElement;
        i.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      });
      await page.keyboard.insertText('e');
      await input.evaluate((el) => {
        el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'e' }));
      });
    }
    await expect(input).not.toHaveValue('MARIA CLARA');
    await expect(check).not.toBeChecked();
  });
}
