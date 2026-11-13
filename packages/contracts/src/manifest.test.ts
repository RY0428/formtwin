import { describe, expect, it } from 'vitest';
import { adoptionHistorySchema, canonicalJson, manifestSchema } from './manifest.ts';

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
  it.each([
    ['missing font', { ...base, files: [file('sourcePdf'), file('formDef')] }],
    ['two formDefs', { ...base, files: [...base.files, file('formDef', 'forms/x.json')] }],
    ['path traversal', { ...base, files: [file('sourcePdf', '../etc/passwd'), file('formDef'), file('font')] }],
    ['absolute path', { ...base, files: [file('sourcePdf', '/etc/passwd'), file('formDef'), file('font')] }],
    ['bad keyId', { ...base, keyId: 'abc' }],
    ['unknown field', { ...base, extra: true }],
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
