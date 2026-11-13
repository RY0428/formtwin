import { expect, test } from '@playwright/test';

// Basic accessibility checks (architecture.md §13 "UI・説明"): every control has an accessible name,
// and the manual flow can be completed with the keyboard only. Not a full audit (no screen-reader run).
for (const origin of ['http://localhost:4174', 'http://localhost:4173']) {
  test(`${origin}: every input and button has an accessible name`, async ({ page }) => {
    await page.goto(`${origin}/`);
    await page.waitForLoadState('networkidle');
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('input:not([type=hidden]), button, a[href], select, textarea')]
        .filter((el) => {
          const e = el as HTMLInputElement;
          const label = e.labels && e.labels.length > 0;
          const aria = e.getAttribute('aria-label') ?? e.getAttribute('aria-labelledby');
          const text = (e.textContent ?? '').trim();
          return !label && !aria && !(el.tagName !== 'INPUT' && text);
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(unnamed).toEqual([]);
  });
}

test('private-app: manual entry, confirmation and PDF creation with the keyboard only', async ({ page }) => {
  await page.goto('http://localhost:4174/');
  await expect(page.getByTestId('boot-status')).toHaveText('ready');
  await page.getByRole('button', { name: 'Continue without AI' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('ai-status')).toHaveText('skipped');
  await page.getByLabel(/^Family name/).focus();
  await page.keyboard.type('TANAKA');
  await page.keyboard.press('Tab'); // → its "Checked against my card" checkbox
  await page.keyboard.press('Space');
  const row = page.locator('div', { has: page.getByLabel(/^Family name/) }).last();
  await expect(row.getByLabel('Checked against my card')).toBeChecked();
  await page.getByRole('button', { name: 'Create PDF' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('pdf-ready')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Save PDF' })).toBeVisible();
});
