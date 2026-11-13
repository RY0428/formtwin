import { describe, expect, it } from 'vitest';
import { formDefCandidateResponseSchema, formDefCandidateSchema } from './formDef.ts';

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
