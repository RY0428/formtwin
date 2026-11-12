import fontkit from '@pdf-lib/fontkit';
import type { PdfLayout } from '@formtwin/contracts';
import { PDFDocument, PDFName, rgb } from 'pdf-lib';

/**
 * Fills a fixed form with CONFIRMED values only (architecture.md §7.4–7.5).
 * - The template hash must match the layout before anything is written.
 * - Values that do not fit, or contain characters the font cannot draw, are not truncated or
 *   substituted: they are reported and left blank.
 * - AcroForm appearances are regenerated with the embedded Japanese font, then flattened.
 * - Document metadata is reset to fixed values; no file name is involved.
 * Everything happens in memory; the result is personal data.
 */
export type FillValue = string | boolean;

export interface FillInput {
  readonly template: Uint8Array;
  readonly font: Uint8Array;
  readonly layout: PdfLayout;
  /** Only confirmed values. Fields absent here stay blank. */
  readonly values: Readonly<Record<string, FillValue>>;
}

export interface FillResult {
  readonly bytes: Uint8Array;
  /** Field ids left blank because the value did not fit or did not match the field kind. */
  readonly notFilled: readonly { id: string; reason: NotFilledReason }[];
}

export type NotFilledReason = 'overflow' | 'unsupported_char' | 'type_mismatch' | 'missing_field';

export class TemplateMismatchError extends Error {
  constructor() {
    super('template hash does not match layout');
    this.name = 'TemplateMismatchError';
  }
}

const FIXED_DATE = new Date(Date.UTC(2000, 0, 1));

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function fillPdf(input: FillInput): Promise<FillResult> {
  if ((await sha256Hex(input.template)) !== input.layout.sourcePdfSha256) throw new TemplateMismatchError();

  const doc = await PDFDocument.load(input.template, { updateMetadata: false });
  doc.registerFontkit(fontkit);
  // Full embedding: @pdf-lib/fontkit 1.1.1 subsetting drops glyphs (CFF crashes, TrueType renders
  // with missing glyphs in pdf.js) — measured 2026-11-12, see docs/spikes/spike-c.md.
  const font = await doc.embedFont(input.font, { subset: false });
  const supported = new Set(font.getCharacterSet());
  const unsupported = (text: string): boolean => [...text].some((ch) => !supported.has(ch.codePointAt(0) ?? -1));
  const form = doc.getForm();
  const pages = doc.getPages();
  const notFilled: { id: string; reason: NotFilledReason }[] = [];

  for (const field of input.layout.fields) {
    const value = input.values[field.id];
    if (value === undefined) continue;
    switch (field.kind) {
      case 'coordinateText': {
        const page = pages[field.page];
        if (typeof value !== 'string' || page === undefined) {
          notFilled.push({ id: field.id, reason: page === undefined ? 'missing_field' : 'type_mismatch' });
          break;
        }
        if (unsupported(value)) {
          notFilled.push({ id: field.id, reason: 'unsupported_char' });
          break;
        }
        if (font.widthOfTextAtSize(value, field.fontSize) > field.width) {
          notFilled.push({ id: field.id, reason: 'overflow' });
          break;
        }
        page.drawText(value, { x: field.x, y: field.y, size: field.fontSize, font, color: rgb(0, 0, 0) });
        break;
      }
      case 'acroText': {
        if (typeof value !== 'string') {
          notFilled.push({ id: field.id, reason: 'type_mismatch' });
          break;
        }
        if (unsupported(value)) {
          notFilled.push({ id: field.id, reason: 'unsupported_char' });
          break;
        }
        let tf;
        try {
          tf = form.getTextField(field.name);
        } catch {
          notFilled.push({ id: field.id, reason: 'missing_field' });
          break;
        }
        const widget = tf.acroField.getWidgets()[0];
        const width = widget === undefined ? 0 : widget.getRectangle().width - 4;
        if (font.widthOfTextAtSize(value, field.fontSize) > width) {
          notFilled.push({ id: field.id, reason: 'overflow' });
          break;
        }
        tf.setFontSize(field.fontSize);
        tf.setText(value);
        break;
      }
      case 'acroCheck': {
        if (typeof value !== 'boolean') {
          notFilled.push({ id: field.id, reason: 'type_mismatch' });
          break;
        }
        try {
          const cb = form.getCheckBox(field.name);
          if (value) cb.check();
          else cb.uncheck();
        } catch {
          notFilled.push({ id: field.id, reason: 'missing_field' });
        }
        break;
      }
    }
  }

  form.updateFieldAppearances(font);
  form.flatten();
  // pdf-lib's getForm() creates an empty AcroForm when the template has none; do not leave it behind.
  if (form.getFields().length === 0) doc.catalog.delete(PDFName.of('AcroForm'));

  // Fixed metadata: nothing derived from the person, the file or the time.
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setProducer('FormTwin');
  doc.setCreator('FormTwin');
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  doc.catalog.delete(PDFName.of('Metadata'));

  const bytes = await doc.save({ updateFieldAppearances: false });
  return { bytes, notFilled };
}
