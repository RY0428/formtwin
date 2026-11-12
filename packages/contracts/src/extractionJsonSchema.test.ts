import { SEMANTIC_KEYS } from '@formtwin/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { extractionResultSchema } from './extraction.ts';
import { extractionJsonSchema } from './extractionJsonSchema.ts';

interface JsonObj {
  properties?: Record<string, JsonObj>;
  items?: JsonObj;
  required?: string[];
  additionalProperties?: unknown;
  enum?: unknown[];
  maxItems?: number;
  maxLength?: number;
}

describe('extractionJsonSchema mirrors the Zod contract', () => {
  const fromZod = z.toJSONSchema(extractionResultSchema) as JsonObj;
  const zodItem = fromZod.properties?.['fields']?.items;
  const handItem = extractionJsonSchema.properties.fields.items;

  it('same required keys and closed objects', () => {
    expect(fromZod.required).toEqual([...extractionJsonSchema.required]);
    expect(fromZod.additionalProperties).toBe(false);
    expect(zodItem?.required?.slice().sort()).toEqual([...handItem.required].sort());
    expect(zodItem?.additionalProperties).toBe(false);
  });

  it('same key enum, array and string limits', () => {
    expect(zodItem?.properties?.['key']?.enum).toEqual([...SEMANTIC_KEYS]);
    expect(handItem.properties.key.enum).toEqual([...SEMANTIC_KEYS]);
    expect(fromZod.properties?.['fields']?.maxItems).toBe(extractionJsonSchema.properties.fields.maxItems);
    expect(JSON.stringify(zodItem?.properties?.['value'])).toContain(
      `"maxLength":${String(handItem.properties.value.maxLength)}`,
    );
  });
});
