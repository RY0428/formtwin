import { adoptionHistorySchema, formDefSchema, type AdoptionHistory, type FormDef } from '@formtwin/contracts';
import history2 from '../../../../forms/history/isa-930004094/rev-2.history.json';
import def2 from '../../../../forms/defs/isa-930004094/rev-2.formdef.json';

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
  'isa-930004094': { formDef: formDefSchema.parse(def2), history: adoptionHistorySchema.parse(history2) },
};

export function adoptedRevisionFor(formId: string): AdoptedRevision | undefined {
  return ADOPTED[formId];
}
