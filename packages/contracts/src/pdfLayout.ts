import { z } from 'zod';

/**
 * Where each output field goes on a fixed form version (architecture.md §7.5).
 * Units are PDF points; origin is the page's bottom-left; pages are 0-based.
 * PROVISIONAL (Spike C): used with a dummy form until the official PDF is fixed.
 */
const fieldId = z.string().regex(/^[a-z][a-zA-Z0-9]{0,63}$/);

export const coordinateTextFieldSchema = z
  .object({
    kind: z.literal('coordinateText'),
    id: fieldId,
    page: z.number().int().min(0).max(50),
    x: z.number().min(0).max(2000),
    y: z.number().min(0).max(2000),
    width: z.number().positive().max(2000),
    fontSize: z.number().min(4).max(48),
  })
  .strict();

export const acroTextFieldSchema = z
  .object({ kind: z.literal('acroText'), id: fieldId, name: z.string().min(1).max(200), fontSize: z.number().min(4).max(48) })
  .strict();

export const acroCheckFieldSchema = z
  .object({ kind: z.literal('acroCheck'), id: fieldId, name: z.string().min(1).max(200) })
  .strict();

export const pdfLayoutSchema = z
  .object({
    formId: z.string().min(1).max(100),
    sourcePdfSha256: z.string().regex(/^[0-9a-f]{64}$/),
    fields: z
      .array(z.discriminatedUnion('kind', [coordinateTextFieldSchema, acroTextFieldSchema, acroCheckFieldSchema]))
      .min(1)
      .max(200),
  })
  .strict()
  .superRefine((layout, ctx) => {
    const ids = new Set<string>();
    for (const f of layout.fields) {
      if (ids.has(f.id)) ctx.addIssue({ code: 'custom', message: `duplicate field id ${f.id}` });
      ids.add(f.id);
    }
  });

export type PdfLayout = z.infer<typeof pdfLayoutSchema>;
export type PdfLayoutField = PdfLayout['fields'][number];
