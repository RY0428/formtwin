import { describe, expect, it } from 'vitest';
import { extractionResultSchema } from './extraction.ts';

describe('extractionResultSchema', () => {
  it('accepts known keys', () => {
    const parsed = extractionResultSchema.safeParse({
      fields: [{ key: 'fullName', value: 'TEST TARO' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown keys, extra properties and duplicates', () => {
    expect(
      extractionResultSchema.safeParse({ fields: [{ key: 'address', value: 'x' }] }).success,
    ).toBe(false);
    expect(
      extractionResultSchema.safeParse({
        fields: [{ key: 'fullName', value: 'x', confidence: 1 }],
      }).success,
    ).toBe(false);
    expect(
      extractionResultSchema.safeParse({
        fields: [
          { key: 'fullName', value: 'a' },
          { key: 'fullName', value: 'b' },
        ],
      }).success,
    ).toBe(false);
  });
});
