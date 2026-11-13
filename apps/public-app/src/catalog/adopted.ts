import { adoptionHistorySchema, formDefSchema, type AdoptionHistory, type FormDef } from '@formtwin/contracts';
import history1 from '../../../../forms/history/isa-930004094/rev-1.history.json';
import def1 from '../../../../forms/defs/isa-930004094/rev-1.formdef.json';

/**
 * The adopted (reviewed) FormDef revision and its adoption history, bundled read-only for display
 * (architecture.md §8.2: show the adopted chain separately from a live, unadopted candidate).
 * The signed package that private-app uses is built from the same files (forms/README.md).
 */
export interface AdoptedRevision {
  readonly formDef: FormDef;
  readonly history: AdoptionHistory;
}

const ADOPTED: Record<string, AdoptedRevision> = {
  'isa-930004094': { formDef: formDefSchema.parse(def1), history: adoptionHistorySchema.parse(history1) },
};

export function adoptedRevisionFor(formId: string): AdoptedRevision | undefined {
  return ADOPTED[formId];
}
