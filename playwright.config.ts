import { defineConfig, devices } from '@playwright/test';

// E2E against production builds served by `vite preview` with the same
// security headers as firebase.json. Run `npm run build` first.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  reporter: process.env['CI'] ? 'line' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    serviceWorkers: 'block',
    trace: 'off',
  },
  webServer: [
    {
      command: 'npm run preview -w @formtwin/public-app',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
    },
    {
      command: 'npm run preview:e2e -w @formtwin/private-app',
      url: 'http://localhost:4174',
      reuseExistingServer: false,
    },
  ],
});
