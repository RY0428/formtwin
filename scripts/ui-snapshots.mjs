// Screenshots of the main screens of both apps (E2E builds: fake cloud analyzer, test signing key,
// fictional values only) into .ui-snapshots/ for visual review after UI changes.
// Usage: npm run ui:snapshots   (builds dist-e2e for both apps first)
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, '.ui-snapshots');
mkdirSync(OUT, { recursive: true });

const servers = ['@formtwin/private-app', '@formtwin/public-app'].map((w) =>
  spawn('npm', ['run', 'preview:e2e', '-w', w], { cwd: ROOT, stdio: 'ignore', detached: true }),
);
const stop = () => {
  for (const s of servers) {
    try {
      process.kill(-s.pid, 'SIGTERM');
    } catch {
      /* already stopped */
    }
  }
};

async function open(page, url) {
  for (let i = 0; i < 60; i += 1) {
    try {
      await page.goto(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`server did not start: ${url}`);
}

const shots = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
  const snap = async (name, opts = { fullPage: true }) => {
    const path = join(OUT, `${name}.png`);
    await page.screenshot({ path, ...opts });
    shots.push(path);
  };

  // private-app
  await open(page, 'http://localhost:4174/');
  await page.getByTestId('boot-status').filter({ hasText: 'ready' }).waitFor();
  await snap('private-01-start');
  await page.getByRole('button', { name: 'Continue without AI' }).click();
  const values = [
    [/^Family name/, 'TANAKA'],
    [/^Given name/, 'HANAKO'],
    [/^Expiry year/, '2027'],
    [/^Expiry month/, '3'],
    [/^Expiry day/, '31'],
    [/^Residence card number/, 'AB12345678CD'],
  ];
  for (const [label, v] of values) await page.getByLabel(label).fill(v);
  for (const c of await page.getByLabel('Checked against my card').all()) await c.check();
  await snap('private-02-filled');
  await page.getByRole('button', { name: 'Create PDF' }).click();
  await page.locator('[data-testid="pdf-preview"][data-state="done"]').waitFor();
  await page.getByTestId('pdf-ready').screenshot({ path: join(OUT, 'private-03-preview.png') });
  shots.push(join(OUT, 'private-03-preview.png'));
  await page.getByRole('button', { name: 'End session and clear data' }).click();
  await snap('private-04-ended');
  // Session lifecycle (M7): warning, lock, inactivity end. Uses Playwright's fake clock.
  const life = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
  await life.clock.install();
  await open(life, 'http://localhost:4174/');
  await life.getByTestId('boot-status').filter({ hasText: 'ready' }).waitFor();
  await life.getByLabel(/^Family name/).fill('TANAKA');
  await life.clock.fastForward('09:01');
  await life.getByTestId('inactivity-warning').waitFor();
  const lifeShot = async (name) => {
    const path = join(OUT, `${name}.png`);
    await life.screenshot({ path });
    shots.push(path);
  };
  await lifeShot('private-05-warning');
  await life.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await life.getByTestId('lock-screen').waitFor();
  await lifeShot('private-06-locked');
  await life.getByRole('button', { name: 'Resume' }).click();
  await life.clock.fastForward('10:01');
  await life.getByTestId('ended-reason').waitFor();
  await lifeShot('private-07-inactivity-ended');
  await life.close();

  // public-app
  await open(page, 'http://localhost:4173/');
  await page.locator('[data-testid="review-canvas"][data-state="done"]').waitFor();
  await page.getByRole('button', { name: 'Analyze in the cloud' }).click();
  await page.getByTestId('overlay-live').first().waitFor();
  await snap('public-01-candidate');
  await page.getByText('Diagnostics (cloud request variants)').click();
  await page.getByRole('button', { name: 'Run diagnostics' }).click();
  await page.getByTestId('diag-row').nth(5).waitFor();
  await page.getByTestId('diagnostics').screenshot({ path: join(OUT, 'public-02-diagnostics.png') });
  shots.push(join(OUT, 'public-02-diagnostics.png'));
} finally {
  await browser.close();
  stop();
}
for (const s of shots) console.log(s);
process.exit(0);
