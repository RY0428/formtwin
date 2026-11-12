import { pdfLayoutSchema, type PdfLayout } from '@formtwin/contracts';
import font from '../../assets/fonts/BIZUDGothic-Regular.ttf?bytes';
import template from '../../assets/forms/official/930004094.pdf?bytes';
import layoutJson from '../../assets/forms/official/930004094.layout.json';

/**
 * Fixed public assets bundled at build time. Prepared and verified before any personal
 * data is accepted (architecture.md §3.1, §6.2-1). No runtime fetch.
 */
export interface FixedAssets {
  readonly template: Uint8Array;
  readonly font: Uint8Array;
  readonly layout: PdfLayout;
}

export const FORM_SOURCE = {
  title: 'Application for Extension of Period of Stay (Form 30-2, applicant part 1)',
  credit: 'Source: Immigration Services Agency of Japan website (https://www.moj.go.jp/isa/applications/procedures/16-3-1.html), Public Data License 1.0.',
} as const;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function prepareFixedAssets(): Promise<FixedAssets> {
  const layout = pdfLayoutSchema.parse(layoutJson);
  if ((await sha256Hex(template)) !== layout.sourcePdfSha256) throw new Error('form-hash-mismatch');
  if (font.length < 1000) throw new Error('font-missing');
  return { template, font, layout };
}
