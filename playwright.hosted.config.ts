import { defineConfig, devices } from '@playwright/test';

// Checks against the DEPLOYED apps (Firebase Hosting, production headers). Manual only:
// `npm run test:hosted`. Not part of `npm run verify` or CI (needs network to the hosted URLs).
export default defineConfig({
  testDir: 'tests/hosted',
  fullyParallel: false,
  reporter: 'list',
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    serviceWorkers: 'block',
    trace: 'off',
  },
});
