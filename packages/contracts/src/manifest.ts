import { z } from 'zod';

/**
 * Signed public package manifest (architecture.md §8.2–8.3).
 * The signature covers the UTF-8 bytes of `manifestSigningText(manifest)` (= `canonicalJson`), with ECDSA P-256 / SHA-256
 * (WebCrypto, IEEE P1363 r||s encoding). Verification code lives with each runtime
 * (private-app src/packages, scripts/forms) because this package has no crypto dependency.
 */
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const keyId = z.string().regex(/^ft-[0-9a-f]{16}$/);

export const PACKAGE_FILE_ROLES = ['sourcePdf', 'formDef', 'font', 'history'] as const;

export const manifestSchema = z
  .object({
    manifestVersion: z.literal(1),
    packageId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    formId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    formDefRevision: z.number().int().min(1),
    schemaVersion: z.literal(1),
    ontologyVersion: z.string().min(1).max(40),
    minAppVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    status: z.enum(['active', 'revoked']),
    createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    keyId,
    files: z
      .array(
        z
          .object({
            path: z.string().regex(/^[A-Za-z0-9._/-]{1,200}$/).refine((p) => !p.includes('..') && !p.startsWith('/')),
            role: z.enum(PACKAGE_FILE_ROLES),
            sha256,
            size: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .superRefine((m, ctx) => {
    for (const role of ['sourcePdf', 'formDef', 'font'] as const) {
      if (m.files.filter((f) => f.role === role).length !== 1) {
        ctx.addIssue({ code: 'custom', message: `exactly one ${role} file required` });
      }
    }
  });

export const manifestSignatureSchema = z
  .object({
    alg: z.literal('ES256'),
    keyId,
    /** base64 of the 64-byte P1363 signature. */
    signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
  })
  .strict();

export const publicKeySchema = z
  .object({
    keyId,
    jwk: z
      .object({ kty: z.literal('EC'), crv: z.literal('P-256'), x: z.string().min(40).max(50), y: z.string().min(40).max(50) })
      .passthrough(),
  })
  .strict();

export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestSignature = z.infer<typeof manifestSignatureSchema>;
export type PackagePublicKey = z.infer<typeof publicKeySchema>;

/** Deterministic JSON: object keys sorted, no whitespace. Only plain JSON values are accepted. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  throw new Error('unsupported value');
}

/** The exact text whose UTF-8 bytes are signed and verified (encode with TextEncoder at the call site). */
export function manifestSigningText(manifest: Manifest): string {
  return canonicalJson(manifest);
}

/** Adoption history entry (architecture.md §8.2): which candidate, if any, a revision came from. */
export const adoptionHistorySchema = z
  .object({
    formId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    formDefRevision: z.number().int().min(1),
    origin: z.enum(['manual-layout', 'cloud-candidate']),
    analysisRunId: z.string().regex(/^run-[0-9a-f-]{36}$/).nullable(),
    model: z.string().max(80).nullable(),
    promptVersion: z.string().max(40).nullable(),
    candidateSha256: sha256.nullable(),
    changes: z
      .array(
        z
          .object({
            fieldId: z.string().max(64),
            action: z.enum(['accepted', 'edited', 'added', 'rejected']),
            note: z.string().max(400),
          })
          .strict(),
      )
      .max(200),
    review: z
      .object({
        reviewedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reviewerRole: z.string().max(80),
        checks: z.array(z.string().max(300)).min(1).max(50),
      })
      .strict(),
  })
  .strict()
  .superRefine((h, ctx) => {
    const fromCloud = h.origin === 'cloud-candidate';
    for (const [k, v] of [
      ['analysisRunId', h.analysisRunId],
      ['model', h.model],
      ['promptVersion', h.promptVersion],
      ['candidateSha256', h.candidateSha256],
    ] as const) {
      if (fromCloud !== (v !== null)) ctx.addIssue({ code: 'custom', message: `${k} must ${fromCloud ? '' : 'not '}be set` });
    }
  });

export type AdoptionHistory = z.infer<typeof adoptionHistorySchema>;

// ---------------------------------------------------------------------------------------------
// Trust list (forms/trust.json, docs/decisions.md 2026-11-14). Bundled at build time; never fetched.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const trustListSchema = z
  .object({
    schemaVersion: z.literal(1),
    keys: z
      .array(
        z
          .object({
            keyId,
            status: z.enum(['active', 'retired', 'revoked']),
            since: isoDate,
            /** Retired keys: packages created on or before this date still verify. */
            retiredAt: isoDate.optional(),
            note: z.string().max(200).optional(),
          })
          .strict()
          .refine((k) => (k.status === 'retired') === (k.retiredAt !== undefined), 'retiredAt only and always for retired keys'),
      )
      .max(20),
    revokedPackages: z
      .array(
        z
          .object({ packageId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/), manifestSha256: sha256, reason: z.string().min(1).max(200), revokedAt: isoDate })
          .strict(),
      )
      .max(200),
  })
  .strict();

export type TrustList = z.infer<typeof trustListSchema>;
export type TrustDecision = 'trusted' | 'untrusted_key' | 'key_revoked' | 'key_retired' | 'package_revoked';

/**
 * Applies the trust list to a manifest whose signature already verified with the key `manifest.keyId`.
 * `manifestSha256` is the SHA-256 (hex) of `manifestSigningText(manifest)`.
 */
export function evaluateTrust(trust: TrustList, manifest: Manifest, manifestSha256: string): TrustDecision {
  if (trust.revokedPackages.some((r) => r.packageId === manifest.packageId && r.manifestSha256 === manifestSha256)) {
    return 'package_revoked';
  }
  const key = trust.keys.find((k) => k.keyId === manifest.keyId);
  if (key === undefined) return 'untrusted_key';
  if (key.status === 'revoked') return 'key_revoked';
  if (key.status === 'retired' && (key.retiredAt === undefined || manifest.createdAt > key.retiredAt)) return 'key_retired';
  return 'trusted';
}

