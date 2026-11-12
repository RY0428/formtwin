import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { installFakeLanguageModel, type FakeOptions } from './fakeLanguageModel.ts';

// Production-like build (dist-e2e, dummy Firebase config) under the production CSP.
// Uses a FAKE LanguageModel: proves wiring and the zero-egress behaviour of the SDK path,
// not real Gemini Nano execution.

const ORIGIN = 'http://localhost:4174';
const CANARY = 'ZQXJ CANARY TARO';

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngBytes(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height, 0x80);
  for (let y = 0; y < height; y++) raw[y * (width * 3 + 1)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const okResponse = JSON.stringify({
  fields: [
    { key: 'fullName', value: CANARY },
    { key: 'residenceCardNumber', value: 'AB12345678CD' },
    { key: 'periodOfStayExpiry', value: null },
  ],
});

interface Observed {
  foreign: string[];
  bodies: string[];
  csp: string[];
}

/** fake: install a fake; 'remove': delete the browser's global; 'real': leave the browser's own global. */
async function open(page: Page, fake: FakeOptions | 'remove' | 'real'): Promise<Observed> {
  const seen: Observed = { foreign: [], bodies: [], csp: [] };
  page.context().on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== ORIGIN) seen.foreign.push(req.url());
    seen.bodies.push(req.url() + '\n' + (req.postData() ?? '') + '\n' + JSON.stringify(req.headers()));
  });
  page.on('console', (m) => {
    if (/Content Security Policy|violates/i.test(m.text())) seen.csp.push(m.text().slice(0, 200));
  });
  if (fake === 'remove') {
    await page.addInitScript(() => {
      delete (window as unknown as { LanguageModel?: unknown }).LanguageModel;
    });
  } else if (fake !== 'real') {
    await page.addInitScript(installFakeLanguageModel, fake);
  }
  await page.goto(`${ORIGIN}/`);
  return seen;
}

test('extracts through the Firebase AI Logic SDK on-device path with zero egress', async ({ page }) => {
  const seen = await open(page, { availability: 'downloadable', response: okResponse });
  await expect(page.getByTestId('availability')).toHaveText('downloadable');
  await page.getByRole('button', { name: 'Prepare AI' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('ready');

  await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: pngBytes(64, 40),
  });
  await page.getByRole('button', { name: 'Extract on this device' }).click();
  await expect(page.getByTestId('result')).toContainText(CANARY);

  const log = await page.evaluate(() => (window as unknown as { __fakeLM: { prompts: { types: string[]; hasConstraint: boolean }[] } }).__fakeLM);
  expect(log.prompts).toHaveLength(1);
  expect(log.prompts[0]?.types).toEqual(['text', 'image:ImageBitmap']);
  expect(log.prompts[0]?.hasConstraint).toBe(true);

  expect(seen.csp).toEqual([]);
  expect(seen.foreign).toEqual([]);
  expect(seen.bodies.join('\n')).not.toContain('CANARY');

  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name ?? ''));
  test.info().annotations.push({ type: 'indexedDB', description: JSON.stringify(dbs) });
  console.log('indexedDB databases after extraction:', JSON.stringify(dbs));
});

test('rejects invalid model output and adopts no candidate', async ({ page }) => {
  await open(page, { availability: 'available', response: '{"fields":[{"key":"address","value":"x"}]}' });
  await page.getByRole('button', { name: 'Prepare AI' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('ready');
  await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: pngBytes(8, 8),
  });
  await page.getByRole('button', { name: 'Extract on this device' }).click();
  await expect(page.getByTestId('error')).toHaveText('invalid_output');
  await expect(page.getByTestId('result')).toHaveCount(0);
});

test('without the Prompt API global, AI is unavailable and nothing is sent to the cloud', async ({ page }) => {
  const seen = await open(page, 'remove');
  await expect(page.getByTestId('availability')).toHaveText('api_missing');
  await page.getByRole('button', { name: 'Prepare AI' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('unavailable');
  await expect(page.getByTestId('ai-reason')).toHaveText('api_missing');
  await expect(page.getByRole('button', { name: 'Extract on this device' })).toBeDisabled();
  expect(seen.foreign).toEqual([]);
});

test('unavailable model leads to manual entry; a skipped session stays manual', async ({ page }) => {
  const seen = await open(page, { availability: 'unavailable', response: okResponse });
  await page.getByRole('button', { name: 'Prepare AI' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('unavailable');
  await page.getByRole('button', { name: 'Continue without AI' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText('skipped');
  await expect(page.getByRole('button', { name: 'Prepare AI' })).toBeDisabled();
  expect(seen.foreign).toEqual([]);
});

test('rejects files that are not decodable JPEG/PNG', async ({ page }) => {
  await open(page, { availability: 'available', response: okResponse });
  await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await expect(page.getByTestId('error')).toHaveText('image_decode_failed');
  await page.getByLabel('Residence card image (JPEG or PNG)').setInputFiles({
    name: 'doc.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7'),
  });
  await expect(page.getByTestId('error')).toHaveText('image_type');
});

test("the dev container's own Chromium Prompt API (no model) is handled as unavailable", async ({ page }) => {
  const seen = await open(page, 'real');
  const hasGlobal = await page.evaluate(() => 'LanguageModel' in window);
  test.skip(!hasGlobal, 'this Chromium build has no LanguageModel global');
  await page.getByRole('button', { name: 'Prepare AI' }).click();
  await expect(page.getByTestId('ai-status')).not.toHaveText('preparing', { timeout: 30_000 });
  await expect(page.getByTestId('ai-status')).not.toHaveText('ready');
  await expect(page.getByRole('button', { name: 'Extract on this device' })).toBeDisabled();
  expect(seen.foreign).toEqual([]);
});
