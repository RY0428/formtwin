import { expect, test, type Page } from '@playwright/test';
import { installFakeLanguageModel, type FakeOptions } from './fakeLanguageModel.ts';

// Device flows: the same steps as the real-device checklist (docs/plans/device-checklist-day7.md and its
// successors). When the checklist changes, change these tests first. Fake model only: not device evidence.
const ORIGIN = 'http://localhost:4174';

async function open(page: Page) {
  const foreign: string[] = [];
  page.context().on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol !== 'data:' && url.protocol !== 'blob:' && url.origin !== ORIGIN) foreign.push(req.url());
  });
  await page.goto(`${ORIGIN}/`);
  await expect(page.getByTestId('boot-status')).toHaveText('ready');
  return foreign;
}

test('device flow: candidates → checked → PDF → edit while focused → End session clears the notice', async ({ page }) => {
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
  const foreign = await open(page);
  await page.getByRole('button', { name: 'Prepare AI' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('ready');
  await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles('data/eval/explore/explore-03.png');
  await page.getByRole('button', { name: 'Extract on this device' }).click();
  await page.getByRole('button', { name: 'Use name: family “SANTOS”, given “MARIA CLARA”' }).click();
  await page.getByRole('button', { name: /^Use expiry/ }).click();
  await page.getByRole('button', { name: /^Use card number/ }).click();
  for (const c of await page.getByLabel('Checked against my card').all()) await c.check();
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByTestId('pdf-preview')).toHaveAttribute('data-state', 'done');
  const card = page.getByLabel(/^Residence card number/);
  await card.click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type(' ');
  await expect(page.getByText('Values changed. Create the PDF again.')).toBeVisible();
  await page.getByRole('button', { name: 'End session and clear data' }).click();
  await expect(page.getByLabel(/^Family name/)).toHaveValue('');
  await expect(page.getByText('Values changed. Create the PDF again.')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Save PDF' })).toHaveCount(0);
  expect(foreign).toEqual([]);
});
