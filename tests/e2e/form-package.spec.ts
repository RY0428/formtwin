import { expect, test } from '@playwright/test';

// The E2E build signs the package with a throwaway key generated at build time.
// Production builds use the committed public key; an unsigned production build refuses entry
// (unit-tested in apps/private-app/src/packages/verifyPackage.test.ts).
test('private-app verifies the bundled form package before entry and labels the test key', async ({ page }) => {
  await page.goto('http://localhost:4174/');
  await expect(page.getByTestId('boot-status')).toHaveText('ready');
  await expect(page.getByTestId('package-info')).toContainText('isa-930004094-r1');
  await expect(page.getByTestId('package-info')).toContainText('TEST KEY');
});
