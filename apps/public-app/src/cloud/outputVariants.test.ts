import { describe, expect, it } from 'vitest';
import { OUTPUT_VARIANTS, generationConfigFor } from './outputVariants.ts';

describe('generationConfigFor', () => {
  it('adds constraints step by step', () => {
    const s = (v: (typeof OUTPUT_VARIANTS)[number]) => JSON.stringify(generationConfigFor(v) ?? {});
    expect(generationConfigFor('none')).toBeUndefined();
    expect(s('json')).not.toContain('responseSchema');
    expect(s('schema-s1')).not.toMatch(/nullable|minItems|minimum|propertyOrdering/);
    expect(s('schema-s2')).toContain('nullable');
    expect(s('schema-s2')).not.toMatch(/minItems|minimum/);
    expect(s('schema-s3')).toContain('minItems');
    expect(s('schema-s3')).not.toMatch(/minimum|propertyOrdering/);
    expect(s('schema-full')).toContain('nullable');
    expect(s('schema-full')).not.toMatch(/minItems|maxItems/);
  });
});
