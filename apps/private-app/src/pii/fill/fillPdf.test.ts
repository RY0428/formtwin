import { pdfLayoutSchema } from '@formtwin/contracts';
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFName } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { fillPdf, TemplateMismatchError } from './fillPdf.ts';

const assets = new URL('../../../assets/', import.meta.url);
const template = new Uint8Array(readFileSync(new URL('forms/dummy-form.pdf', assets)));
const font = new Uint8Array(readFileSync(new URL('fonts/BIZUDGothic-Regular.ttf', assets)));
const layout = pdfLayoutSchema.parse(JSON.parse(readFileSync(new URL('forms/dummy-form.layout.json', assets), 'utf8')));

// Fictional values only.
const values = {
  nameKanji: '山田 花子',
  nameRoman: 'YAMADA HANAKO',
  expiry: '2027年03月31日',
  residenceCardNumber: 'AB12345678CD',
  address: '東京都千代田区霞が関１－１－１　髙﨑テストハイツ１０１号室',
  familyInJapan: true,
};

async function pageText(bytes: Uint8Array): Promise<string> {
  const task = pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const text = content.items.map((i) => ('str' in i ? i.str : '')).join('\n');
  await task.destroy();
  return text;
}

describe('fillPdf (dummy form)', () => {
  it('writes Japanese and Latin values that round-trip through text extraction', async () => {
    const { bytes, notFilled } = await fillPdf({ template, font, layout, values });
    expect(notFilled).toEqual([]);
    const text = await pageText(bytes);
    for (const v of ['山田 花子', 'YAMADA HANAKO', '2027年03月31日', 'AB12345678CD', '霞が関', '髙﨑']) {
      expect(text).toContain(v);
    }
  });

  it('flattens the form and resets metadata', async () => {
    const { bytes } = await fillPdf({ template, font, layout, values });
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getForm().getFields()).toHaveLength(0);
    expect(doc.getTitle() ?? '').toBe('');
    expect(doc.getAuthor() ?? '').toBe('');
    expect(doc.getProducer()).toBe('FormTwin');
    expect(doc.getCreationDate()?.toISOString()).toBe('2000-01-01T00:00:00.000Z');
  });

  it('leaves blank and reports values that do not fit, without truncating', async () => {
    const long = 'MONTGOMERY-WHITTINGTON ALEXANDRA VICTORIA ELIZABETH CHARLOTTE';
    const { bytes, notFilled } = await fillPdf({
      template,
      font,
      layout,
      values: { nameRoman: long, residenceCardNumber: 'X'.repeat(80) },
    });
    expect(notFilled).toEqual([
      { id: 'nameRoman', reason: 'overflow' },
      { id: 'residenceCardNumber', reason: 'overflow' },
    ]);
    const text = await pageText(bytes);
    expect(text).not.toContain('MONTGOMERY');
  });

  it('writes only the given (confirmed) values', async () => {
    const { bytes } = await fillPdf({ template, font, layout, values: { nameRoman: 'YAMADA HANAKO' } });
    const text = await pageText(bytes);
    expect(text).toContain('YAMADA HANAKO');
    expect(text).not.toContain('AB12345678CD');
  });

  it('rejects a template that does not match the layout hash', async () => {
    const tampered = template.slice();
    const i = tampered.length - 10;
    tampered[i] = (tampered[i] ?? 0) ^ 0xff;
    await expect(fillPdf({ template: tampered, font, layout, values })).rejects.toBeInstanceOf(TemplateMismatchError);
  });

  it('leaves blank values with characters the font cannot draw (no substitution)', async () => {
    const { notFilled } = await fillPdf({ template, font, layout, values: { nameKanji: '𠮷田 太郎', address: '𠮷野町' } });
    expect(notFilled).toEqual([
      { id: 'nameKanji', reason: 'unsupported_char' },
      { id: 'address', reason: 'unsupported_char' },
    ]);
  });

  it('rejects wrong value types', async () => {
    const { notFilled } = await fillPdf({ template, font, layout, values: { familyInJapan: 'yes', nameKanji: true } });
    expect(notFilled).toEqual([
      { id: 'nameKanji', reason: 'type_mismatch' },
      { id: 'familyInJapan', reason: 'type_mismatch' },
    ]);
  });
});

describe('fillPdf (official form 930004094, page 1)', () => {
  const officialTemplate = new Uint8Array(readFileSync(new URL('../../../../../forms/sources/930004094.pdf', import.meta.url)));
  const officialLayout = pdfLayoutSchema.parse(
    JSON.parse(readFileSync(new URL('forms/official/930004094.layout.json', assets), 'utf8')),
  );

  it('fills name, expiry date parts and card number (fictional values)', async () => {
    const { bytes, notFilled } = await fillPdf({
      template: officialTemplate,
      font,
      layout: officialLayout,
      values: {
        familyName: 'TANAKA',
        givenName: 'HANAKO',
        expiryYear: '2027',
        expiryMonth: '03',
        expiryDay: '31',
        residenceCardNumber: 'AB12345678CD',
      },
    });
    expect(notFilled).toEqual([]);
    const text = await pageText(bytes);
    for (const v of ['TANAKA', 'HANAKO', '2027', 'AB12345678CD']) expect(text).toContain(v);
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(7);
    expect(out.catalog.has(PDFName.of('AcroForm'))).toBe(false);
  });
});
