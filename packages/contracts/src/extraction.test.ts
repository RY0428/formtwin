import { describe, expect, it } from 'vitest';
import { extractionResultSchema, normalizeExtraction } from './extraction.ts';

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

describe('normalizeExtraction', () => {
  it('turns textual placeholders into null and trims, without other changes', () => {
    const out = normalizeExtraction({
      fields: [
        { key: 'fullName', value: '  SANTOS JOÃO PEDRO ' },
        { key: 'residenceCardNumber', value: 'N/A' },
        { key: 'periodOfStayExpiry', value: 'null' },
      ],
    });
    expect(out.fields).toEqual([
      { key: 'fullName', value: 'SANTOS JOÃO PEDRO' },
      { key: 'residenceCardNumber', value: null },
      { key: 'periodOfStayExpiry', value: null },
    ]);
  });

  it('keeps real values that merely contain the word', () => {
    expect(normalizeExtraction({ fields: [{ key: 'fullName', value: 'NULLA ANNA' }] }).fields[0]?.value).toBe(
      'NULLA ANNA',
    );
  });
});
