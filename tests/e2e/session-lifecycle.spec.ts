import { expect, test, type Page } from '@playwright/test';
import { installFakeLanguageModel, type FakeOptions } from './fakeLanguageModel.ts';

// M7 session end/resume (docs/decisions.md: inactivity 10 min, warning 1 min before, hidden tab locks).
// Fake model only: not device evidence.
const ORIGIN = 'http://localhost:4174';

async function open(page: Page, fake: FakeOptions = { availability: 'unavailable', response: '' }) {
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

test('locked longer than the limit ends on return (wall-clock recheck, no timer tick)', async ({ page }) => {
  await open(page);
  await family(page).fill('SANTOS');
  await setVisibility(page, 'hidden');
  // Pause timers, then move Date.now without running them: only the recheck on return can end the session.
  const t = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(t + 100);
  await page.clock.setSystemTime(t + 11 * 60 * 1000);
  await setVisibility(page, 'visible');
  await expect(page.getByTestId('ended-reason')).toContainText('stayed locked');
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
  await expect(family(page)).toHaveValue('');
});

test('Resume after the deadline ends instead of resuming', async ({ page }) => {
  await open(page);
  await family(page).fill('SANTOS');
  await setVisibility(page, 'hidden');
  await setVisibility(page, 'visible');
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  const t = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(t + 100);
  await page.clock.setSystemTime(t + 11 * 60 * 1000);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByTestId('ended-reason')).toContainText('stayed locked');
  await expect(family(page)).toHaveValue('');
});

test('ending during extraction drops the late result and the busy state', async ({ page }) => {
  const foreign = await open(page, {
    availability: 'available',
    delayMs: 5000,
    response: JSON.stringify({ fields: [{ key: 'fullName', value: 'SANTOS MARIA CLARA' }] }),
  });
  await page.getByRole('button', { name: 'Prepare AI' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('ready');
  await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles('data/eval/explore/explore-03.png');
  await page.getByRole('button', { name: 'Extract on this device' }).click();
  await expect(page.getByText('Extracting', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'End session and clear data' }).click();
  await expect(page.getByText('Extracting', { exact: false })).toHaveCount(0);
  await page.clock.fastForward('00:06');
  await expect(page.getByRole('button', { name: /^Use name/ })).toHaveCount(0);
  expect(foreign).toEqual([]);
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
