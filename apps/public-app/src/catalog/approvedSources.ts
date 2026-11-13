import moj930004094 from '../../../../forms/sources/930004094.pdf?bytes';

/**
 * Approved public originals (architecture.md §8.1). The cloud request is built only from an
 * entry in this catalog, resolved by its ID; bytes are bundled at build time and their
 * SHA-256 is re-checked before every request. Approval record: docs/forms/official-form-930004094.md.
 */
export interface ApprovedSource {
  readonly formId: string;
  readonly title: string;
  readonly issuer: string;
  readonly sourceUrl: string;
  readonly retrievedOn: string;
  readonly license: string;
  readonly sha256: string;
  readonly mimeType: 'application/pdf';
  /** 0-based pages the analysis covers (the MVP target is page 1 only). */
  readonly targetPages: readonly number[];
  readonly bytes: Uint8Array;
}

const SOURCES = [
  {
    formId: 'isa-930004094',
    title: 'Application for Extension of Period of Stay (Form 30-2), applicant part 1',
    issuer: 'Immigration Services Agency of Japan',
    sourceUrl: 'https://www.moj.go.jp/isa/content/930004094.pdf',
    retrievedOn: '2026-11-12',
    license: 'Public Data License 1.0 (attribution required)',
    sha256: 'f4a84e52db12074d9e007d0228fc8116c9f522dd6d4ad3dde920c6ee2bbecab3',
    mimeType: 'application/pdf',
    targetPages: [0],
    bytes: moj930004094,
  },
] as const satisfies readonly ApprovedSource[];

export type ApprovedFormId = (typeof SOURCES)[number]['formId'];

export const APPROVED_FORM_IDS: readonly ApprovedFormId[] = SOURCES.map((s) => s.formId);

export function isApprovedFormId(value: unknown): value is ApprovedFormId {
  return typeof value === 'string' && (APPROVED_FORM_IDS as readonly string[]).includes(value);
}

/** Returns the approved entry, or undefined for any other value. Never accepts bytes from callers. */
export function resolveApprovedSource(formId: unknown): ApprovedSource | undefined {
  if (!isApprovedFormId(formId)) return undefined;
  return SOURCES.find((s) => s.formId === formId);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
