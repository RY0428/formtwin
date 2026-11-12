import { SEMANTIC_KEYS } from '@formtwin/domain';
import { z } from 'zod';

/**
 * Output contract for on-device extraction candidates (provisional).
 * The schema is strict: unknown keys are rejected. Passing JSON.parse alone
 * is never treated as success (tech-stack.md §5).
 */
export const EXTRACTION_SCHEMA_VERSION = '0.0.0-provisional';

export const extractionFieldSchema = z
  .object({
    key: z.enum(SEMANTIC_KEYS),
    value: z.string().max(200).nullable(),
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
