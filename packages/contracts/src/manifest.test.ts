import { describe, expect, it } from 'vitest';
import { adoptionHistorySchema, canonicalJson, evaluateTrust, keyIdForJwk, manifestSchema, trustListSchema, type Manifest } from './manifest.ts';

const file = (role: string, path = `forms/${role}.bin`) => ({ path, role, sha256: 'a'.repeat(64), size: 10 });
const base = {
  manifestVersion: 1,
  packageId: 'p-r1',
  formId: 'p',
  formDefRevision: 1,
  schemaVersion: 1,
  ontologyVersion: '0',
  minAppVersion: '0.1.0',
  status: 'active',
  createdAt: '2026-11-13',
  keyId: 'ft-0123456789abcdef',
  files: [file('sourcePdf'), file('formDef'), file('font')],
};

describe('manifestSchema', () => {
  it('accepts a minimal manifest', () => {
    expect(manifestSchema.safeParse(base).success).toBe(true);
  });
  it('accepts one optional latinFont and a -p<n> packaging suffix', () => {
    expect(manifestSchema.safeParse({ ...base, packageId: 'p-r1-p2', files: [...base.files, file('latinFont')] }).success).toBe(true);
  });
  it.each([
    ['missing font', { ...base, files: [file('sourcePdf'), file('formDef')] }],
    ['two formDefs', { ...base, files: [...base.files, file('formDef', 'forms/x.json')] }],
    ['path traversal', { ...base, files: [file('sourcePdf', '../etc/passwd'), file('formDef'), file('font')] }],
    ['absolute path', { ...base, files: [file('sourcePdf', '/etc/passwd'), file('formDef'), file('font')] }],
    ['bad keyId', { ...base, keyId: 'abc' }],
    ['unknown field', { ...base, extra: true }],
    ['two latinFonts', { ...base, files: [...base.files, file('latinFont'), file('latinFont', 'forms/y.ttf')] }],
    ['packageId of another revision', { ...base, packageId: 'p-r2' }],
    ['packaging suffix -p1', { ...base, packageId: 'p-r1-p1' }],
  ])('rejects %s', (_n, m) => {
    expect(manifestSchema.safeParse(m).success).toBe(false);
  });
});

describe('canonicalJson', () => {
  it('rejects non-finite numbers', () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
  });
});

describe('adoptionHistorySchema', () => {
  const h = {
    formId: 'p',
    formDefRevision: 2,
    origin: 'cloud-candidate',
    analysisRunId: 'run-123e4567-e89b-12d3-a456-426614174000',
    model: 'm',
    promptVersion: 'v',
    candidateSha256: 'b'.repeat(64),
    changes: [],
    review: { reviewedOn: '2026-11-13', reviewerRole: 'project maintainer', checks: ['x'] },
  };
  it('requires run details for a cloud candidate and forbids them for a manual layout', () => {
    expect(adoptionHistorySchema.safeParse(h).success).toBe(true);
    expect(adoptionHistorySchema.safeParse({ ...h, analysisRunId: null }).success).toBe(false);
    expect(adoptionHistorySchema.safeParse({ ...h, origin: 'manual-layout' }).success).toBe(false);
  });
});

describe('trust list', () => {
  const m = { packageId: 'p-r1', keyId: 'ft-0123456789abcdef', createdAt: '2026-11-13' } as unknown as Manifest;
  const tbase = { schemaVersion: 1 as const, updatedAt: '2026-11-14', revokedPackages: [] };
  it('evaluates every state', () => {
    expect(evaluateTrust({ ...tbase, keys: [] }, m, 'a'.repeat(64))).toBe('untrusted_key');
    expect(evaluateTrust({ ...tbase, keys: [{ keyId: m.keyId, status: 'active', since: '2026-11-01' }] }, m, 'a'.repeat(64))).toBe('trusted');
    expect(evaluateTrust({ ...tbase, keys: [{ keyId: m.keyId, status: 'revoked', since: '2026-11-01' }] }, m, 'a'.repeat(64))).toBe('key_revoked');
    expect(evaluateTrust({ ...tbase, keys: [{ keyId: m.keyId, status: 'retired', since: '2026-11-01', retiredAt: '2026-11-13' }] }, m, 'a'.repeat(64))).toBe('trusted');
    expect(evaluateTrust({ ...tbase, keys: [{ keyId: m.keyId, status: 'retired', since: '2026-11-01', retiredAt: '2026-11-12' }] }, m, 'a'.repeat(64))).toBe('key_retired');
    expect(
      evaluateTrust(
        { ...tbase, keys: [{ keyId: m.keyId, status: 'active', since: '2026-11-01' }], revokedPackages: [{ packageId: 'p-r1', manifestSha256: 'a'.repeat(64), reason: 'x', revokedAt: '2026-11-14' }] },
        m,
        'a'.repeat(64),
      ),
    ).toBe('package_revoked');
  });
  it('rejects duplicate key ids (a later "revoked" entry must not be shadowed)', () => {
    const k = { keyId: 'ft-0123456789abcdef', since: '2026-11-01' };
    expect(trustListSchema.safeParse({ ...tbase, keys: [{ ...k, status: 'active' }, { ...k, status: 'revoked' }] }).success).toBe(false);
  });
  it('derives key ids from the key material', async () => {
    const id = await keyIdForJwk({ kty: 'EC', crv: 'P-256', x: 'a', y: 'b' });
    expect(id).toMatch(/^ft-[0-9a-f]{16}$/);
    expect(await keyIdForJwk({ kty: 'EC', crv: 'P-256', x: 'a', y: 'c' })).not.toBe(id);
  });
});
