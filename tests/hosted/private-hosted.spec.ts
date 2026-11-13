import { expect, test, type Page } from '@playwright/test';

// Deployed private app (https://formtwin-dev-private.web.app), real Firebase Hosting headers and CSP.
// Automates the manual steps B1–B3 of the Day 8–12 device check. Container Chromium has no on-device
// model, so AI steps (Prepare/Cancel/Extract with a real model) are NOT covered here: they stay a
// device check on the developer's Chrome. Fictional values only.
const ORIGIN = 'https://formtwin-dev-private.web.app';

const VALUES: [RegExp, string][] = [
  [/^Family name/, 'TANAKA'],
  [/^Given name/, 'HANAKO'],
  [/^Expiry year/, '2027'],
  [/^Expiry month/, '3'],
  [/^Expiry day/, '31'],
  [/^Residence card number/, 'AB12345678CD'],
];

async function open(page: Page) {
  const foreign: string[] = [];
  page.context().on('request', (req) => {
    const u = new URL(req.url());
    if (u.protocol !== 'data:' && u.protocol !== 'blob:' && u.origin !== ORIGIN) foreign.push(req.url());
  });
  await page.addInitScript(() => {
    const list: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = list;
    document.addEventListener('securitypolicyviolation', (e) => list.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const res = await page.goto(`${ORIGIN}/`);
  await expect(page.getByTestId('boot-status')).toHaveText('ready', { timeout: 30_000 });
  const build = (await page.locator('footer').innerText()).match(/Build (\S+)\./)?.[1] ?? 'unknown';
  test.info().annotations.push({ type: 'build', description: build });
  return { foreign, csp: res?.headers()['content-security-policy'] ?? '' };
}

async function hideAndShow(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test('hosted B1–B3: lock and resume, Save PDF without lock, End session then Prepare AI enabled', async ({ page }) => {
  const { foreign, csp } = await open(page);
  expect(csp).toContain('connect-src data:;');

  // B1: hidden page locks; Resume restores the values.
  await page.getByRole('button', { name: 'Continue without AI' }).click();
  for (const [label, v] of VALUES) await page.getByLabel(label).fill(v);
  await hideAndShow(page);
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  await expect(page.getByTestId('session-content')).toBeHidden();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByLabel(/^Family name/)).toHaveValue('TANAKA');

  // B2: Create PDF → Save PDF (download); no lock.
  for (const c of await page.getByLabel('Checked against my card').all()) await c.check();
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await expect(page.getByTestId('pdf-preview')).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Save PDF' }).click()]);
  const path = await download.path();
  const { readFileSync } = await import('node:fs');
  expect(readFileSync(path).subarray(0, 5).toString()).toBe('%PDF-');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);

  // B3: End session clears values; AI can be prepared again after "Continue without AI".
  await page.getByRole('button', { name: 'End session and clear data' }).click();
  await expect(page.getByLabel(/^Family name/)).toHaveValue('');
  await expect(page.getByTestId('ai-status')).toHaveText('not_started');
  await expect(page.getByRole('button', { name: 'Prepare AI' })).toBeEnabled();

  const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  expect(violations).toEqual([]);
  expect(foreign).toEqual([]);
});

test('hosted public app: same build as the private app, pinned CSP host list', async ({ page }) => {
  await page.goto(`${ORIGIN}/`);
  await expect(page.getByTestId('boot-status')).toHaveText('ready', { timeout: 30_000 });
  const privateBuild = (await page.locator('footer').innerText()).match(/Build (\S+)\./)?.[1];
  const res = await page.goto('https://formtwin-dev.web.app/');
  const csp = res?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain('connect-src \'self\' https://firebasevertexai.googleapis.com https://content-firebaseappcheck.googleapis.com https://www.google.com/recaptcha/;');
  await expect(page.getByText(/build [0-9a-f]{7}/)).toBeVisible();
  expect(privateBuild).toBeDefined();
  await expect(page.getByText(`build ${privateBuild ?? '?'}`)).toBeVisible();
  test.info().annotations.push({ type: 'public build', description: (await page.getByText(/build [0-9a-f]{7}/).innerText()) });
});
