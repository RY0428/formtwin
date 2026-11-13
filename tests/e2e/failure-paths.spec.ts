import { expect, test, type Page } from '@playwright/test';
import { installFakeLanguageModel, type FakeOptions } from './fakeLanguageModel.ts';

// M8 failure paths (docs/decisions.md: 30 s limit, at most one retry for invalid output, no cloud).
// Fake model and fake clock only: not device evidence.
const ORIGIN = 'http://localhost:4174';
const VALID = JSON.stringify({ fields: [{ key: 'fullName', value: 'SANTOS MARIA CLARA' }] });

async function open(page: Page, fake: FakeOptions) {
  const foreign: string[] = [];
  page.context().on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol !== 'data:' && url.protocol !== 'blob:' && url.origin !== ORIGIN) foreign.push(req.url());
  });
  await page.clock.install();
  await page.addInitScript(installFakeLanguageModel, fake);
  await page.goto(`${ORIGIN}/`);
  await expect(page.getByTestId('boot-status')).toHaveText('ready');
  return foreign;
}

async function prepareAndExtract(page: Page) {
  await page.getByRole('button', { name: 'Prepare AI' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('ready');
  await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles('data/eval/explore/explore-03.png');
  await page.getByRole('button', { name: 'Extract on this device' }).click();
}

const prompts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fakeLM: { prompts: unknown[] } }).__fakeLM.prompts.length);

test('time limit: result discarded at 30 s, manual entry open, no new request until the call returns', async ({ page }) => {
  const foreign = await open(page, { availability: 'available', response: VALID, delayMs: 40_000 });
  await prepareAndExtract(page);
  await page.clock.fastForward('00:31');
  await expect(page.getByTestId('error')).toHaveText('timeout');
  await expect(page.getByTestId('error-reason')).toContainText('longer than 30 seconds');
  await expect(page.getByTestId('extract-finishing')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Extract on this device' })).toBeDisabled();
  await page.getByLabel(/^Family name/).fill('SANTOS');
  // The fake prompt starts after the SDK's async image conversion, so allow its full 40 s from here.
  await page.clock.fastForward('00:45');
  await expect(page.getByTestId('extract-finishing')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Use name/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Extract on this device' })).toBeEnabled();
  await expect(page.getByLabel(/^Family name/)).toHaveValue('SANTOS');
  expect(await prompts(page)).toBe(1);
  expect(foreign).toEqual([]);
});

test('invalid output is retried once on the device and the second answer is used', async ({ page }) => {
  const foreign = await open(page, { availability: 'available', response: '', responses: ['not json', VALID] });
  await prepareAndExtract(page);
  await expect(page.getByRole('button', { name: /^Use name/ }).first()).toBeVisible();
  await expect(page.getByTestId('error')).toHaveCount(0);
  expect(await prompts(page)).toBe(2);
  expect(foreign).toEqual([]);
});

test('a second invalid output stops with a reason; no third attempt', async ({ page }) => {
  await open(page, { availability: 'available', response: 'not json' });
  await prepareAndExtract(page);
  await expect(page.getByTestId('error')).toHaveText('invalid_output');
  await expect(page.getByTestId('error-reason')).toContainText('even after one retry');
  await expect(page.getByText('Type the values instead.')).toBeVisible();
  await page.clock.fastForward('00:31');
  expect(await prompts(page)).toBe(2);
});

test('cancelling AI preparation: a late completion does not switch to AI', async ({ page }) => {
  const foreign = await open(page, { availability: 'downloadable', response: VALID, createDelayMs: 20_000 });
  await page.getByRole('button', { name: 'Prepare AI' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('preparing');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('failed');
  await expect(page.getByTestId('ai-reason')).toHaveText('cancelled');
  await page.clock.fastForward('00:25');
  await expect(page.getByTestId('ai-status')).toHaveText('failed');
  await page.getByLabel(/^Family name/).fill('SANTOS');
  await expect(page.getByLabel(/^Family name/)).toHaveValue('SANTOS');
  expect(foreign).toEqual([]);
});
