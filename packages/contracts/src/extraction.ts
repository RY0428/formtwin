import { SEMANTIC_KEYS } from '@formtwin/domain';
import { z } from 'zod';
import { EXTRACTION_VALUE_MAX_LENGTH } from './extractionJsonSchema.ts';

/**
 * Output contract for on-device extraction candidates (provisional).
 * The schema is strict: unknown keys are rejected. Passing JSON.parse alone
 * is never treated as success (tech-stack.md §5).
 */
export const EXTRACTION_SCHEMA_VERSION = '0.0.0-provisional';

export const extractionFieldSchema = z
  .object({
    key: z.enum(SEMANTIC_KEYS),
    value: z.string().max(EXTRACTION_VALUE_MAX_LENGTH).nullable(),
  })
  .strict();

export const extractionResultSchema = z
  .object({
    fields: z.array(extractionFieldSchema).max(SEMANTIC_KEYS.length),
  })
  .strict()
  .superRefine((result, ctx) => {
    const seen = new Set<string>();
    for (const field of result.fields) {
      if (seen.has(field.key)) {
        ctx.addIssue({ code: 'custom', message: 'duplicate key' });
      }
      seen.add(field.key);
    }
  });

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

const NOT_READ = new Set(['', 'null', 'none', 'n/a', 'na', 'undefined', '-', '--', 'unknown']);

/**
 * Turns "not read" placeholders the model sometimes writes as text (e.g. the string "null",
 * measured at the gate 2026-11-12) into JSON null, and trims values. Values are otherwise kept
 * exactly as returned: no case changes, no character substitution.
 */
export function normalizeExtraction(result: ExtractionResult): ExtractionResult {
  return {
    fields: result.fields.map((f) => {
      if (f.value === null) return f;
      const v = f.value.trim();
      return { key: f.key, value: NOT_READ.has(v.toLowerCase()) ? null : v };
    }),
  };
}
