import { describe, expect, it } from 'vitest';
import { formDefCandidateResponseSchema, formDefCandidateSchema, formDefSchema } from './formDef.ts';

const field = {
  labelJa: '氏名',
  labelEn: 'Name',
  kind: 'text',
  semanticKey: 'fullName',
  status: 'resolved',
  page: 0,
  box: [100, 120, 130, 600],
};

describe('formDefCandidateSchema', () => {
  it('accepts a well-formed candidate', () => {
    expect(formDefCandidateSchema.safeParse({ fields: [field] }).success).toBe(true);
  });

  it.each([
    ['unknown key', { ...field, extra: 1 }],
    ['unknown semantic key', { ...field, semanticKey: 'passportNumber' }],
    ['resolved without key', { ...field, semanticKey: null }],
    ['key on unsupported', { ...field, status: 'unsupported' }],
    ['empty box', { ...field, box: [100, 120, 100, 600] }],
    ['out of range', { ...field, box: [100, 120, 130, 1001] }],
    ['control characters', { ...field, labelEn: 'Na\u0007me' }],
    ['too long', { ...field, labelJa: 'あ'.repeat(121) }],
  ])('rejects %s', (_name, bad) => {
    expect(formDefCandidateSchema.safeParse({ fields: [bad] }).success).toBe(false);
  });

  it('rejects an empty field list', () => {
    expect(formDefCandidateSchema.safeParse({ fields: [] }).success).toBe(false);
  });

  it('response schema lists the same required properties as the Zod schema', () => {
    const items = formDefCandidateResponseSchema.properties.fields.items;
    expect([...items.required].sort()).toEqual(Object.keys(field).sort());
  });
});


describe('formDefSchema (reviewed revision)', () => {
  const field = {
    fieldId: 'familyName',
    labelJa: '氏名',
    labelEn: 'Family name',
    semanticKey: 'fullName',
    transform: 'name.family',
    placement: { page: 0, x: 140, y: 617, width: 150, fontSize: 11 },
  };
  const def = {
    schemaVersion: 1,
    ontologyVersion: '0',
    formId: 'isa-930004094',
    issuerVersion: 'x',
    formDefRevision: 1,
    sourcePdfSha256: 'a'.repeat(64),
    page: { index: 0, width: 595.276, height: 841.89 },
    title: 'T',
    credit: 'C',
    checkedAt: '2026-11-12',
    fields: [field],
  };
  it('accepts a valid revision', () => {
    expect(formDefSchema.safeParse(def).success).toBe(true);
  });
  it.each([
    ['transform for another key', { ...field, transform: 'date.year' }],
    ['outside the page width', { ...field, placement: { ...field.placement, x: 500 } }],
    ['another page', { ...field, placement: { ...field.placement, page: 1 } }],
    ['code-like transform', { ...field, transform: 'eval(x)' }],
  ])('rejects %s', (_n, f) => {
    expect(formDefSchema.safeParse({ ...def, fields: [f] }).success).toBe(false);
  });
  it('rejects duplicate field ids', () => {
    expect(formDefSchema.safeParse({ ...def, fields: [field, field] }).success).toBe(false);
  });
});
