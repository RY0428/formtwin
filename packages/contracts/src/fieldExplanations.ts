import { z } from 'zod';

/**
 * Public field explanations (docs/decisions.md 2026-11-14): plain-English reference text for the fields of
 * an adopted, approved FormDef. Generated with the cloud-first hybrid mode on the public side only (apps/public-app/src/cloud/fieldExplainer.ts); the
 * input is public labels, never personal data. Always re-validated with this schema.
 */
export const FIELD_EXPLANATION_MAX_LENGTH = 200;
export const FIELD_EXPLANATIONS_PROMPT_VERSION = 'explain-2';

const text = z
  .string()
  .min(1)
  .max(FIELD_EXPLANATION_MAX_LENGTH)
  .refine((s) => ![...s].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f), 'control characters');

export const fieldExplanationsSchema = z
  .object({
    items: z
      .array(z.object({ fieldId: z.string().regex(/^[a-z][a-zA-Z0-9]{0,63}$/), explanation: text }).strict())
      .min(1)
      .max(50),
  })
  .strict();

export type FieldExplanations = z.infer<typeof fieldExplanationsSchema>;

/** Cloud `responseSchema` (OpenAPI subset: types, enums, required only — see formDef.ts note). */
export function fieldExplanationsResponseSchema(fieldIds: readonly string[]) {
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: { fieldId: { type: 'string', enum: [...fieldIds] }, explanation: { type: 'string' } },
          required: ['fieldId', 'explanation'],
        },
      },
    },
    required: ['items'],
  } as const;
}

/** On-device `responseConstraint` (plain JSON Schema). */
export function fieldExplanationsJsonSchema(fieldIds: readonly string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        maxItems: fieldIds.length,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['fieldId', 'explanation'],
          properties: {
            fieldId: { type: 'string', enum: [...fieldIds] },
            explanation: { type: 'string', maxLength: FIELD_EXPLANATION_MAX_LENGTH },
          },
        },
      },
    },
  } as const;
}
