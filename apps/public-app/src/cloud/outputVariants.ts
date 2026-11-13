import { FIELD_KINDS, FORM_DEF_CANDIDATE_MAX_FIELDS, MAPPING_STATUSES, formDefCandidateResponseSchema } from '@formtwin/contracts';
import { SEMANTIC_KEYS } from '@formtwin/domain';

/**
 * Fixed output-configuration variants (diagnostics for the hosted 400 "invalid argument", 2026-11-13).
 * Callers choose a variant by name only; no caller-supplied schema is accepted.
 * - none: no responseMimeType / schema
 * - json: responseMimeType application/json only
 * - schema-s1..s3: the candidate schema with constraints added step by step
 * - schema-full: the production schema (formDefCandidateResponseSchema)
 */
export const OUTPUT_VARIANTS = ['none', 'json', 'schema-s1', 'schema-s2', 'schema-s3', 'schema-full'] as const;
export type OutputVariant = (typeof OUTPUT_VARIANTS)[number];

type Json = Record<string, unknown>;

function candidateSchema(level: 1 | 2 | 3): Json {
  const box: Json = { type: 'array', items: { type: 'integer' } };
  if (level >= 3) Object.assign(box, { minItems: 4, maxItems: 4 });
  const semanticKey: Json = { type: 'string', enum: [...SEMANTIC_KEYS] };
  if (level >= 2) semanticKey['nullable'] = true;
  const fields: Json = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        labelJa: { type: 'string' },
        labelEn: { type: 'string' },
        kind: { type: 'string', enum: [...FIELD_KINDS] },
        semanticKey,
        status: { type: 'string', enum: [...MAPPING_STATUSES] },
        page: { type: 'integer' },
        box,
      },
      required: ['labelJa', 'labelEn', 'kind', 'status', 'page', 'box', ...(level >= 2 ? ['semanticKey'] : [])],
    },
  };
  if (level >= 3) Object.assign(fields, { minItems: 1, maxItems: FORM_DEF_CANDIDATE_MAX_FIELDS });
  return { type: 'object', properties: { fields }, required: ['fields'] };
}

/** `generationConfig` for a variant (plain data; the SDK serializes it). */
export function generationConfigFor(variant: OutputVariant): Json | undefined {
  switch (variant) {
    case 'none':
      return undefined;
    case 'json':
      return { responseMimeType: 'application/json' };
    case 'schema-s1':
      return { responseMimeType: 'application/json', responseSchema: candidateSchema(1) };
    case 'schema-s2':
      return { responseMimeType: 'application/json', responseSchema: candidateSchema(2) };
    case 'schema-s3':
      return { responseMimeType: 'application/json', responseSchema: candidateSchema(3) };
    case 'schema-full':
      return { responseMimeType: 'application/json', responseSchema: formDefCandidateResponseSchema as unknown as Json };
  }
}

/** Variant used by the normal analysis. Changed only after the diagnostics identify a working one. */
export const PRODUCTION_VARIANT: OutputVariant = 'schema-full';
