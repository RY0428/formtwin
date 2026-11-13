import { expect, test } from '@playwright/test';

// public-app E2E build (vite --mode e2e) uses a FAKE cloud analyzer.
// This checks the UI and gateway wiring only; it is not evidence of a real cloud call.
const ORIGIN = 'http://localhost:4173';

test('approved original → unadopted candidate, with a request log', async ({ page }) => {
  await page.goto(`${ORIGIN}/`);
  await expect(page.getByTestId('source-sha')).toHaveText(
    'f4a84e52db12074d9e007d0228fc8116c9f522dd6d4ad3dde920c6ee2bbecab3',
  );
  await page.getByRole('button', { name: 'Analyze in the cloud' }).click();
  await expect(page.getByRole('heading', { name: 'Unadopted candidate' })).toBeVisible();
  await expect(page.getByTestId('candidate-field')).toHaveCount(4);
  await expect(page.getByTestId('run-id')).toHaveText(/^run-/);
  const statuses = await page.getByTestId('request-log').locator('li[data-status]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-status')),
  );
  expect(statuses).toEqual(['planned', 'started', 'completed']);
});

test('the public app offers no way to provide a file or URL', async ({ page }) => {
  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.locator('input, textarea, [contenteditable="true"]')).toHaveCount(0);
});

test('review shows the original with adopted boxes, then live boxes, the comparison and history', async ({ page }) => {
  const csp: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|violates/i.test(m.text())) csp.push(m.text().slice(0, 200));
  });
  await page.goto(`${ORIGIN}/`);
  await expect(page.getByTestId('review-canvas')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('overlay-adopted')).toHaveCount(6);
  await expect(page.getByTestId('overlay-live')).toHaveCount(0);
  await expect(page.getByTestId('history')).toContainText('cloud-candidate');
  await page.getByRole('button', { name: 'Analyze in the cloud' }).click();
  await expect(page.getByTestId('overlay-live')).toHaveCount(4);
  await expect(page.getByTestId('comparison').locator('[data-key="fullName"]')).toHaveAttribute('data-status', 'both');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Export candidate for review' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^candidate-run-.*\.json$/);
  expect(csp).toEqual([]);
});

test('diagnostics run each fixed output variant once and report the outcome (fake)', async ({ page }) => {
  await page.goto(`${ORIGIN}/`);
  await page.getByText('Diagnostics (cloud request variants)').click();
  await page.getByRole('button', { name: 'Run diagnostics' }).click();
  await expect(page.getByTestId('diag-row')).toHaveCount(6);
  await expect(page.locator('[data-testid="diag-row"][data-variant="schema-s3"]')).toHaveAttribute('data-outcome', 'request_failed');
  await expect(page.locator('[data-testid="diag-row"][data-variant="schema-s3"]')).toContainText('invalid argument');
  await expect(page.locator('[data-testid="diag-row"][data-variant="none"]')).toContainText('yes');
  await expect(page.locator('[data-testid="diag-row"][data-variant="schema-full"]')).toHaveAttribute('data-outcome', 'ok');
});

test('429 from the service: English reason, no automatic retry, nothing sent during the cooldown', async ({ page }) => {
  await page.goto(`${ORIGIN}/?fake=429`);
  await page.getByRole('button', { name: 'Analyze in the cloud' }).click();
  await expect(page.getByTestId('analysis-error')).toContainText('Too many requests. Wait a minute');
  await page.getByRole('button', { name: 'Analyze in the cloud' }).click();
  await expect(page.getByTestId('request-log').locator('li[data-status]').last()).toHaveAttribute('data-status', 'rejected');
  const statuses = await page.getByTestId('request-log').locator('li[data-status]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-status')),
  );
  // One request reached the (fake) service; the second click was refused locally.
  expect(statuses).toEqual(['planned', 'started', 'unknown', 'rejected']);
});
