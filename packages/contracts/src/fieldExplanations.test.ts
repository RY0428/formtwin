import { describe, expect, it } from 'vitest';
import { fieldExplanationsResponseSchema, fieldExplanationsSchema } from './fieldExplanations.ts';

describe('fieldExplanationsSchema', () => {
  const ok = { items: [{ fieldId: 'familyName', explanation: 'Your family name as on your residence card.' }] };
  it('accepts a well-formed answer', () => {
    expect(fieldExplanationsSchema.safeParse(ok).success).toBe(true);
  });
  it.each([
    ['extra key', { items: [{ ...ok.items[0], extra: 1 }] }],
    ['too long', { items: [{ fieldId: 'familyName', explanation: 'a'.repeat(201) }] }],
    ['control characters', { items: [{ fieldId: 'familyName', explanation: 'a\u0007b' }] }],
    ['empty', { items: [] }],
  ])('rejects %s', (_n, bad) => {
    expect(fieldExplanationsSchema.safeParse(bad).success).toBe(false);
  });
  it('cloud response schema avoids keywords the service rejected', () => {
    expect(JSON.stringify(fieldExplanationsResponseSchema(['a']))).not.toMatch(/minItems|maxItems|maxLength/);
  });
});
