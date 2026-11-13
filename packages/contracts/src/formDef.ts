import { SEMANTIC_KEYS } from '@formtwin/domain';
import { z } from 'zod';

/**
 * FormDef CANDIDATE produced by the public-side cloud analysis (architecture.md §8.2).
 * A candidate is untrusted, unreviewed data even when it satisfies this schema:
 * it is never bundled into private-app until a human has reviewed and signed it.
 *
 * Coordinates: `box` is [yMin, xMin, yMax, xMax] normalized to 0–1000 on the page
 * (top-left origin). Review converts them to PDF points; they are not used for filling as is.
 */
export const FORM_DEF_CANDIDATE_MAX_FIELDS = 80;
export const FORM_DEF_LABEL_MAX_LENGTH = 120;

export const MAPPING_STATUSES = ['resolved', 'unsupported', 'ambiguous'] as const;
export const FIELD_KINDS = ['text', 'date', 'checkbox', 'other'] as const;

const label = z
  .string()
  .min(1)
  .max(FORM_DEF_LABEL_MAX_LENGTH)
  // Control characters are rejected (architecture.md §7.2).
  .refine((s) => ![...s].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f), 'control characters');

const coordinate = z.number().int().min(0).max(1000);

export const formDefCandidateFieldSchema = z
  .object({
    labelJa: label,
    labelEn: label,
    kind: z.enum(FIELD_KINDS),
    semanticKey: z.enum(SEMANTIC_KEYS).nullable(),
    status: z.enum(MAPPING_STATUSES),
    page: z.number().int().min(0).max(50),
    box: z.tuple([coordinate, coordinate, coordinate, coordinate]),
  })
  .strict()
  .superRefine((f, ctx) => {
    const [yMin, xMin, yMax, xMax] = f.box;
    if (yMin >= yMax || xMin >= xMax) ctx.addIssue({ code: 'custom', message: 'empty box' });
    if (f.status === 'resolved' && f.semanticKey === null) {
      ctx.addIssue({ code: 'custom', message: 'resolved without semanticKey' });
    }
    if (f.status !== 'resolved' && f.semanticKey !== null) {
      ctx.addIssue({ code: 'custom', message: 'semanticKey only when resolved' });
    }
  });

export const formDefCandidateSchema = z
  .object({ fields: z.array(formDefCandidateFieldSchema).min(1).max(FORM_DEF_CANDIDATE_MAX_FIELDS) })
  .strict();

export type FormDefCandidate = z.infer<typeof formDefCandidateSchema>;
export type FormDefCandidateField = FormDefCandidate['fields'][number];

/**
 * The same shape as an OpenAPI-subset schema for `generationConfig.responseSchema`
 * (Firebase AI Logic `SchemaRequest`, firebase 13.3.0). Plain data: contracts has no SDK dependency.
 * The Zod schema above is still applied to every response.
 */
export const formDefCandidateResponseSchema = {
  type: 'object',
  properties: {
    fields: {
      type: 'array',
      minItems: 1,
      maxItems: FORM_DEF_CANDIDATE_MAX_FIELDS,
      items: {
        type: 'object',
        properties: {
          labelJa: { type: 'string' },
          labelEn: { type: 'string' },
          kind: { type: 'string', enum: [...FIELD_KINDS] },
          semanticKey: { type: 'string', enum: [...SEMANTIC_KEYS], nullable: true },
          status: { type: 'string', enum: [...MAPPING_STATUSES] },
          page: { type: 'integer', minimum: 0, maximum: 50 },
          box: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'integer', minimum: 0, maximum: 1000 } },
        },
        required: ['labelJa', 'labelEn', 'kind', 'semanticKey', 'status', 'page', 'box'],
        propertyOrdering: ['labelJa', 'labelEn', 'kind', 'semanticKey', 'status', 'page', 'box'],
      },
    },
  },
  required: ['fields'],
} as const;

// ---------------------------------------------------------------------------------------------
// Reviewed FormDef revision (architecture.md §5, §8.2–8.3). Produced only by human review
// (scripts/forms/promote-forms.mjs); bundled into private-app inside a signed package.

/** Reviewed conversion rules. FormDef never carries code or free expressions (architecture.md §5.2). */
export const TRANSFORM_IDS = ['identity', 'name.family', 'name.given', 'date.year', 'date.month', 'date.day'] as const;
export type TransformId = (typeof TRANSFORM_IDS)[number];

const TRANSFORM_KEY: Record<TransformId, (typeof SEMANTIC_KEYS)[number] | null> = {
  identity: null,
  'name.family': 'fullName',
  'name.given': 'fullName',
  'date.year': 'periodOfStayExpiry',
  'date.month': 'periodOfStayExpiry',
  'date.day': 'periodOfStayExpiry',
};

const fieldIdString = z.string().regex(/^[a-z][a-zA-Z0-9]{0,63}$/);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const formDefFieldSchema = z
  .object({
    fieldId: fieldIdString,
    labelJa: label,
    labelEn: label,
    semanticKey: z.enum(SEMANTIC_KEYS),
    transform: z.enum(TRANSFORM_IDS),
    /** PDF points, bottom-left origin, 0-based page (same convention as pdfLayout.ts). */
    placement: z
      .object({
        page: z.number().int().min(0).max(50),
        x: z.number().min(0).max(2000),
        y: z.number().min(0).max(2000),
        width: z.number().positive().max(2000),
        fontSize: z.number().min(4).max(48),
      })
      .strict(),
  })
  .strict()
  .superRefine((f, ctx) => {
    const required = TRANSFORM_KEY[f.transform];
    if (required !== null && required !== f.semanticKey) {
      ctx.addIssue({ code: 'custom', message: `transform ${f.transform} needs ${required}` });
    }
  });

export const formDefSchema = z
  .object({
    schemaVersion: z.literal(1),
    ontologyVersion: z.string().min(1).max(40),
    formId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    issuerVersion: z.string().min(1).max(120),
    formDefRevision: z.number().int().min(1),
    sourcePdfSha256: sha256,
    page: z.object({ index: z.number().int().min(0), width: z.number().positive(), height: z.number().positive() }).strict(),
    title: label,
    credit: z.string().min(1).max(400),
    checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    fields: z.array(formDefFieldSchema).min(1).max(200),
  })
  .strict()
  .superRefine((d, ctx) => {
    const ids = new Set<string>();
    for (const f of d.fields) {
      if (ids.has(f.fieldId)) ctx.addIssue({ code: 'custom', message: `duplicate field ${f.fieldId}` });
      ids.add(f.fieldId);
      const p = f.placement;
      if (p.page !== d.page.index || p.x + p.width > d.page.width || p.y + p.fontSize > d.page.height) {
        ctx.addIssue({ code: 'custom', message: `field ${f.fieldId} is outside the page` });
      }
    }
  });

export type FormDef = z.infer<typeof formDefSchema>;
export type FormDefField = FormDef['fields'][number];
