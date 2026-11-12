import { expect, test, type Page } from '@playwright/test';

// Observes page-initiated requests and CSP violations at the browser-context
// level. Scope: what Playwright can see from this context. Browser-managed
// traffic (e.g. model downloads) is outside this observation (architecture.md §13).

async function observe(page: Page, origin: string) {
  const foreignRequests: string[] = [];
  const cspErrors: string[] = [];
  page.context().on('request', (req) => {
    const url = new URL(req.url());
    if (url.origin !== origin) foreignRequests.push(req.url());
  });
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) cspErrors.push(msg.text());
  });
  page.on('pageerror', (err) => cspErrors.push(`pageerror: ${err.message}`));
  return { foreignRequests, cspErrors };
}

const apps = [
  { name: 'private-app', origin: 'http://localhost:4174', heading: 'FormTwin' },
  { name: 'public-app', origin: 'http://localhost:4173', heading: 'FormTwin — Public form analysis' },
];

for (const app of apps) {
  test(`${app.name} renders under production CSP without violations or foreign requests`, async ({ page }) => {
    const seen = await observe(page, app.origin);
    const response = await page.goto(`${app.origin}/`);
    expect(response?.headers()['content-security-policy']).toBeTruthy();
    await expect(page.getByRole('heading', { level: 1, name: app.heading })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(seen.cspErrors).toEqual([]);
    expect(seen.foreignRequests).toEqual([]);
  });
}

test('private-app CSP blocks connections, including same-origin fetch', async ({ page }) => {
  const seen = await observe(page, 'http://localhost:4174');
  await page.goto('http://localhost:4174/');
  const blocked = await page.evaluate(async () => {
    try {
      await window.fetch('/index.html');
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  expect(seen.cspErrors.join('\n')).toMatch(/connect-src/);
});
