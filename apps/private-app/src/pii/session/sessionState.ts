import { FIELD_IDS, type FieldId } from './fields.ts';

/**
 * Field values and confirmations for one in-memory session (architecture.md §7.4).
 * A confirmation is bound to the value revision it was made for; any change to the value
 * withdraws it. `inputRevision` changes on every value/confirmation change and invalidates PDFs.
 */
export interface FieldState {
  readonly value: string;
  readonly revision: number;
  readonly source: 'manual' | 'candidate';
  /** Revision that was confirmed, or null. Valid only if equal to `revision`. */
  readonly confirmedRevision: number | null;
}

export interface SessionState {
  readonly fields: Readonly<Record<FieldId, FieldState>>;
  readonly inputRevision: number;
}

export type SessionEvent =
  | { type: 'edit'; id: FieldId; value: string }
  | { type: 'applyCandidate'; values: Partial<Record<FieldId, string>> }
  | { type: 'confirm'; id: FieldId }
  | { type: 'unconfirm'; id: FieldId }
  | { type: 'reset' };

const empty: FieldState = { value: '', revision: 0, source: 'manual', confirmedRevision: null };

export function initialSession(): SessionState {
  return {
    fields: Object.fromEntries(FIELD_IDS.map((id) => [id, empty])) as Record<FieldId, FieldState>,
    inputRevision: 0,
  };
}

export const isConfirmed = (f: FieldState): boolean => f.confirmedRevision === f.revision && f.value !== '';

function setValue(state: SessionState, id: FieldId, value: string, source: FieldState['source']): SessionState {
  const f = state.fields[id];
  if (f.value === value && f.source === source) return state;
  return {
    fields: { ...state.fields, [id]: { value, revision: f.revision + 1, source, confirmedRevision: null } },
    inputRevision: state.inputRevision + 1,
  };
}

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'edit':
      return setValue(state, event.id, event.value, 'manual');
    case 'applyCandidate': {
      let next = state;
      for (const id of FIELD_IDS) {
        const v = event.values[id];
        if (v !== undefined) next = setValue(next, id, v, 'candidate');
      }
      return next;
    }
    case 'confirm': {
      const f = state.fields[event.id];
      if (f.value === '' || f.confirmedRevision === f.revision) return state;
      return {
        fields: { ...state.fields, [event.id]: { ...f, confirmedRevision: f.revision } },
        inputRevision: state.inputRevision + 1,
      };
    }
    case 'unconfirm': {
      const f = state.fields[event.id];
      if (f.confirmedRevision === null) return state;
      return {
        fields: { ...state.fields, [event.id]: { ...f, confirmedRevision: null } },
        inputRevision: state.inputRevision + 1,
      };
    }
    case 'reset':
      return { ...initialSession(), inputRevision: state.inputRevision + 1 };
  }
}

/** Immutable snapshot of what goes into a PDF (architecture.md §7.5 PdfSnapshot). */
export interface PdfSnapshot {
  readonly inputRevision: number;
  readonly values: Readonly<Partial<Record<FieldId, string>>>;
  readonly excluded: readonly { id: FieldId; reason: 'empty' | 'unconfirmed' }[];
}

export function takeSnapshot(state: SessionState): PdfSnapshot {
  const values: Partial<Record<FieldId, string>> = {};
  const excluded: { id: FieldId; reason: 'empty' | 'unconfirmed' }[] = [];
  for (const id of FIELD_IDS) {
    const f = state.fields[id];
    if (f.value === '') excluded.push({ id, reason: 'empty' });
    else if (!isConfirmed(f)) excluded.push({ id, reason: 'unconfirmed' });
    else values[id] = f.value;
  }
  return Object.freeze({ inputRevision: state.inputRevision, values: Object.freeze(values), excluded: Object.freeze(excluded) });
}
