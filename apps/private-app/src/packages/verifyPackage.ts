import {
  evaluateTrust,
  keyIdForJwk,
  formDefSchema,
  manifestSchema,
  manifestSignatureSchema,
  manifestSigningText,
  publicKeySchema,
  trustListSchema,
  type FormDef,
  type Manifest,
  type PdfLayout,
} from '@formtwin/contracts';
import { ONTOLOGY_VERSION } from '@formtwin/domain';
import { FIELD_IDS } from '../pii/session/fields.ts';

/**
 * Start-up verification of the bundled public form package (architecture.md §3.1, §6.2-1, §8.2–8.3).
 * Runs before any personal data is accepted; any failure disables entry. It proves the files are the
 * ones the maintainer key signed; it does not prove they are semantically correct or up to date.
 */
export const APP_VERSION = '0.1.0';

export interface BundledPackage {
  readonly packageId: string;
  /** True only in the E2E build (throwaway key generated at build time). */
  readonly testKey: boolean;
  readonly manifest: unknown;
  readonly signature: unknown;
  readonly publicKey: unknown;
  /** forms/trust.json at build time (E2E: a list trusting the throwaway key). */
  readonly trust: unknown;
  readonly files: { readonly sourcePdf: Uint8Array; readonly formDef: Uint8Array; readonly font: Uint8Array; readonly history: Uint8Array };
}

export type PackageErrorCode =
  | 'unsigned'
  | 'malformed'
  | 'key_mismatch'
  | 'bad_signature'
  | 'revoked'
  | 'untrusted_key'
  | 'key_revoked'
  | 'key_retired'
  | 'incompatible'
  | 'hash_mismatch'
  | 'invalid_formdef';

export class PackageError extends Error {
  constructor(readonly code: PackageErrorCode) {
    super(code);
  }
}

export interface VerifiedPackage {
  readonly manifest: Manifest;
  readonly formDef: FormDef;
  readonly template: Uint8Array;
  readonly font: Uint8Array;
  readonly layout: PdfLayout;
  readonly testKey: boolean;
  /** Date of the bundled trust list (withdrawals made later reach users only with a new build). */
  readonly trustUpdatedAt: string;
}

/** The fixed binding table this app version implements (MVP: one person, simple fields; architecture.md §5.2). */
const SUPPORTED_BINDINGS: Record<(typeof FIELD_IDS)[number], { key: string; transform: string }> = {
  familyName: { key: 'fullName', transform: 'name.family' },
  givenName: { key: 'fullName', transform: 'name.given' },
  expiryYear: { key: 'periodOfStayExpiry', transform: 'date.year' },
  expiryMonth: { key: 'periodOfStayExpiry', transform: 'date.month' },
  expiryDay: { key: 'periodOfStayExpiry', transform: 'date.day' },
  residenceCardNumber: { key: 'residenceCardNumber', transform: 'identity' },
};

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

function b64ToBytes(s: string): Uint8Array {
  const t = atob(s);
  const a = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i += 1) a[i] = t.charCodeAt(i);
  return a;
}

function versionAtLeast(have: string, need: string): boolean {
  const h = have.split('.').map(Number);
  const n = need.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const a = h[i] ?? 0;
    const b = n[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

export function toPdfLayout(def: FormDef): PdfLayout {
  return {
    formId: def.formId,
    sourcePdfSha256: def.sourcePdfSha256,
    fields: def.fields.map((f) => ({ kind: 'coordinateText' as const, id: f.fieldId, ...f.placement })),
  };
}

export async function verifyPackage(pkg: BundledPackage, appVersion = APP_VERSION): Promise<VerifiedPackage> {
  if (pkg.manifest === null || pkg.signature === null || pkg.publicKey === null) throw new PackageError('unsigned');
  const m = manifestSchema.safeParse(pkg.manifest);
  const s = manifestSignatureSchema.safeParse(pkg.signature);
  const k = publicKeySchema.safeParse(pkg.publicKey);
  const t = trustListSchema.safeParse(pkg.trust);
  if (!m.success || !s.success || !k.success || !t.success) throw new PackageError('malformed');
  const manifest = m.data;
  if (manifest.keyId !== s.data.keyId || s.data.keyId !== k.data.keyId) throw new PackageError('key_mismatch');
  // The id must be derived from the key material itself (a swapped key file keeps its name only).
  if ((await keyIdForJwk(k.data.jwk)) !== k.data.keyId) throw new PackageError('key_mismatch');

  let ok: boolean;
  try {
    const { kty, crv, x, y } = k.data.jwk;
    const key = await crypto.subtle.importKey('jwk', { kty, crv, x, y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'verify',
    ]);
    ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      b64ToBytes(s.data.signature) as BufferSource,
      new TextEncoder().encode(manifestSigningText(manifest)) as BufferSource,
    );
  } catch {
    ok = false;
  }
  if (!ok) throw new PackageError('bad_signature');

  if (manifest.status !== 'active') throw new PackageError('revoked');
  // A key file alone is not trusted: the bundled trust list decides (docs/decisions.md 2026-11-14).
  const decision = evaluateTrust(t.data, manifest, await sha256Hex(new TextEncoder().encode(manifestSigningText(manifest))));
  if (decision === 'package_revoked') throw new PackageError('revoked');
  if (decision !== 'trusted') throw new PackageError(decision);
  if (
    manifest.schemaVersion !== 1 ||
    manifest.ontologyVersion !== ONTOLOGY_VERSION ||
    !versionAtLeast(appVersion, manifest.minAppVersion)
  ) {
    throw new PackageError('incompatible');
  }

  for (const f of manifest.files) {
    const bytes = pkg.files[f.role];
    if (bytes.length !== f.size || (await sha256Hex(bytes)) !== f.sha256) throw new PackageError('hash_mismatch');
  }

  let formDef: FormDef;
  try {
    formDef = formDefSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(pkg.files.formDef)));
  } catch {
    throw new PackageError('invalid_formdef');
  }
  if (
    formDef.formId !== manifest.formId ||
    formDef.formDefRevision !== manifest.formDefRevision ||
    formDef.sourcePdfSha256 !== (await sha256Hex(pkg.files.sourcePdf))
  ) {
    throw new PackageError('invalid_formdef');
  }
  const ids = formDef.fields.map((f) => f.fieldId).sort();
  if (ids.join() !== [...FIELD_IDS].sort().join()) throw new PackageError('incompatible');
  for (const f of formDef.fields) {
    const want = SUPPORTED_BINDINGS[f.fieldId as (typeof FIELD_IDS)[number]];
    if (want.key !== f.semanticKey || want.transform !== f.transform) throw new PackageError('incompatible');
  }

  return {
    manifest,
    formDef,
    template: pkg.files.sourcePdf,
    font: pkg.files.font,
    layout: toPdfLayout(formDef),
    testKey: pkg.testKey,
    trustUpdatedAt: t.data.updatedAt,
  };
}
