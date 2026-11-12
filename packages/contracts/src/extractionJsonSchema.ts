import { SEMANTIC_KEYS } from '@formtwin/domain';

/**
 * Plain JSON Schema passed to the on-device model as `responseConstraint`.
 * Kept in the same shape as `extractionResultSchema` (Zod); the response is
 * always re-validated with Zod, because the generator's support for each
 * keyword is not guaranteed (tech-stack.md §5).
 */
export const EXTRACTION_VALUE_MAX_LENGTH = 200;

export const extractionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['fields'],
  properties: {
    fields: {
      type: 'array',
      maxItems: SEMANTIC_KEYS.length,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'value'],
        properties: {
          key: { type: 'string', enum: [...SEMANTIC_KEYS] },
          value: { type: ['string', 'null'], maxLength: EXTRACTION_VALUE_MAX_LENGTH },
        },
      },
    },
  },
} as const;
