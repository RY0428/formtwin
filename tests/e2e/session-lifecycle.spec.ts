import { expect, test, type Page } from '@playwright/test';
import { installFakeLanguageModel, type FakeOptions } from './fakeLanguageModel.ts';

// M7 session end/resume (docs/decisions.md: inactivity 10 min, warning 1 min before, hidden tab locks).
// Fake model only: not device evidence.
const ORIGIN = 'http://localhost:4174';

async function open(page: Page) {
  const foreign: string[] = [];
  page.context().on('request', (req) => {
    const url = new URL(req.url());
    if (
      url.protocol !== 'data:' &&
      url.protocol !== 'blob:' &&
      url.origin !== ORIGIN
    )
      foreign.push(req.url());
  });
  await page.clock.install();
  const fake: FakeOptions = { availability: 'unavailable', response: '' };
  await page.addInitScript(installFakeLanguageModel, fake);
  await page.goto(`${ORIGIN}/`);
  await expect(page.getByTestId('boot-status')).toHaveText('ready');
  return foreign;
}

async function setVisibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => s,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

const family = (page: Page) => page.getByLabel(/^Family name/);

test('inactivity: warning at 9 min, end and clear at 10 min', async ({
  page,
}) => {
  const foreign = await open(page);
  await family(page).fill('SANTOS');
  await page.clock.fastForward('09:01');
  await expect(page.getByTestId('inactivity-warning')).toBeVisible();
  await page.clock.fastForward('01:00');
  await expect(page.getByTestId('ended-reason')).toContainText(
    '10 minutes without activity',
  );
  await expect(family(page)).toHaveValue('');
  await expect(page.getByTestId('inactivity-warning')).toHaveCount(0);
  expect(foreign).toEqual([]);
});

test('activity during the warning keeps the session', async ({ page }) => {
  await open(page);
  await family(page).fill('SANTOS');
  await page.clock.fastForward('09:01');
  await page.getByRole('button', { name: 'Keep working' }).click();
  await page.clock.fastForward('00:02');
  await expect(page.getByTestId('inactivity-warning')).toHaveCount(0);
  await page.clock.fastForward('02:00');
  await expect(page.getByTestId('ended-reason')).toHaveCount(0);
  await expect(family(page)).toHaveValue('SANTOS');
});

test('hidden tab locks at once; Resume restores within the limit', async ({
  page,
}) => {
  await open(page);
  await family(page).fill('SANTOS');
  await setVisibility(page, 'hidden');
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  await expect(page.getByTestId('session-content')).toBeHidden();
  await setVisibility(page, 'visible');
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
  await expect(family(page)).toHaveValue('SANTOS');
});

test('locked longer than the limit ends on return', async ({ page }) => {
  await open(page);
  await family(page).fill('SANTOS');
  await setVisibility(page, 'hidden');
  await page.clock.fastForward('10:01');
  await setVisibility(page, 'visible');
  await expect(page.getByTestId('ended-reason')).toContainText('stayed locked');
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
  await expect(family(page)).toHaveValue('');
});

test('focus loss alone (e.g. a save dialog) does not lock', async ({
  page,
}) => {
  await open(page);
  await family(page).fill('SANTOS');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.clock.fastForward('00:05');
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
  await expect(family(page)).toHaveValue('SANTOS');
});

test('restore from back/forward cache starts a new session', async ({
  page,
}) => {
  await open(page);
  await family(page).fill('SANTOS');
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true }),
    ),
  );
  await expect(page.getByTestId('ended-reason')).toContainText('back/forward');
  await expect(family(page)).toHaveValue('');
});
