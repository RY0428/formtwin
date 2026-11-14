import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { installFakeLanguageModel, type FakeOptions } from './fakeLanguageModel.ts';

// M12 accessibility (docs/decisions.md 2026-11-14): axe with WCAG A/AA tags in key states, 200% zoom,
// live regions and focus. Automated checks only: not a WCAG conformance claim, no screen-reader run.
const PRIVATE = 'http://localhost:4174';
const PUBLIC = 'http://localhost:4173';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function axe(page: Page, state: string) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const found = r.violations.map((v) => `${state}: ${v.id} (${v.impact ?? '?'}) ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(found, found.join('\n')).toEqual([]);
}

async function fillAll(page: Page) {
  for (const [label, v] of [
    [/^Family name/, 'TANAKA'],
    [/^Given name/, 'HANAKO'],
    [/^Expiry year/, '2027'],
    [/^Expiry month/, '3'],
    [/^Expiry day/, '31'],
    [/^Residence card number/, 'AB12345678CD'],
  ] as const) await page.getByLabel(label).fill(v);
  for (const c of await page.getByLabel('Checked against my card').all()) await c.check();
}

test('private-app: axe in start, filled, PDF, error, lock and ended states', async ({ page }) => {
  const fake: FakeOptions = { availability: 'available', response: 'not json' };
  await page.addInitScript(installFakeLanguageModel, fake);
  await page.clock.install();
  await page.goto(`${PRIVATE}/`);
  await expect(page.getByTestId('boot-status')).toHaveText('ready');
  await axe(page, 'start');
  await page.getByRole('button', { name: 'Prepare AI' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('ready');
  await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles('data/eval/explore/explore-03.png');
  await page.getByRole('button', { name: 'Extract on this device' }).click();
  await expect(page.getByTestId('error')).toHaveText('invalid_output');
  await axe(page, 'extraction error');
  await fillAll(page);
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByTestId('pdf-preview')).toHaveAttribute('data-state', 'done');
  await axe(page, 'PDF ready');
  await page.clock.fastForward('09:01');
  await expect(page.getByTestId('inactivity-warning')).toBeVisible();
  await axe(page, 'inactivity warning');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  await axe(page, 'locked');
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'End session and clear data' }).click();
  await axe(page, 'ended');
});

test('public-app: axe on load and with a candidate and diagnostics', async ({ page }) => {
  await page.goto(`${PUBLIC}/`);
  await page.locator('[data-testid="review-canvas"][data-state="done"]').waitFor();
  await axe(page, 'public start');
  await page.getByRole('button', { name: 'Analyze in the cloud' }).click();
  await page.getByTestId('overlay-live').first().waitFor();
  await page.getByText('Diagnostics (cloud request variants)').click();
  await page.getByRole('button', { name: 'Run diagnostics' }).click();
  await page.getByTestId('diag-row').nth(5).waitFor();
  await axe(page, 'public candidate + diagnostics');
});

for (const origin of [PRIVATE, PUBLIC]) {
  test(`${origin}: 200% zoom (640 px CSS width) has no horizontal page scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 450 });
    await page.goto(`${origin}/`);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('private-app at 200% zoom: manual flow completes and controls stay inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 450 });
  await page.goto(`${PRIVATE}/`);
  await expect(page.getByTestId('boot-status')).toHaveText('ready');
  await page.getByRole('button', { name: 'Continue without AI' }).click();
  await fillAll(page);
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByTestId('pdf-preview')).toHaveAttribute('data-state', 'done');
  const save = page.getByRole('link', { name: 'Save PDF' });
  await save.scrollIntoViewIfNeeded();
  const box = await save.boundingBox();
  expect(box !== null && box.x >= 0 && box.x + box.width <= 640).toBe(true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('private-app focus: lock → Resume, resume → previous field, End session → end message', async ({ page }) => {
  await page.goto(`${PRIVATE}/`);
  await expect(page.getByTestId('boot-status')).toHaveText('ready');
  await page.getByRole('button', { name: 'Continue without AI' }).click();
  const family = page.getByLabel(/^Family name/);
  await family.click();
  await page.keyboard.type('TANAKA');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(family).toBeFocused();
  await page.getByRole('button', { name: 'End session and clear data' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('ended-user')).toBeFocused();
});

test('private-app live regions: warning is an alert, automatic end and errors are announced', async ({ page }) => {
  const fake: FakeOptions = { availability: 'available', response: 'not json' };
  await page.addInitScript(installFakeLanguageModel, fake);
  await page.clock.install();
  await page.goto(`${PRIVATE}/`);
  await expect(page.getByTestId('boot-status')).toHaveText('ready');
  await expect(page.locator('[aria-live]', { has: page.getByTestId('ai-status') })).toHaveCount(1);
  await page.getByRole('button', { name: 'Prepare AI' }).click();
  await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles('data/eval/explore/explore-03.png');
  await page.getByRole('button', { name: 'Extract on this device' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'could not be used' })).toBeVisible();
  await page.getByLabel(/^Family name/).fill('TANAKA');
  await page.clock.fastForward('09:01');
  await expect(page.getByRole('alert').filter({ hasText: 'No activity for 9 minutes' })).toBeVisible();
  await page.clock.fastForward('01:00');
  const ended = page.getByRole('status').filter({ hasText: '10 minutes without activity' });
  await expect(ended).toBeVisible();
  await expect(page.getByTestId('ended-reason')).toBeFocused();
});
