import { FIELD_IDS, type FieldId } from './fields.ts';

/**
 * Confirmation and revision state for one in-memory session (architecture.md §7.4).
 *
 * The field VALUES are owned by React Hook Form (tech-stack.md §3); this state never holds a
 * second copy. Every value change goes through the session use cases (useSessionForm), which
 * update the form and report the change here: the field revision is bumped, its confirmation is
 * withdrawn, and `inputRevision` changes so any PDF built earlier is invalid.
 */
export interface FieldState {
  readonly revision: number;
  readonly source: 'manual' | 'candidate';
  /** Whether the current value is non-empty. */
  readonly filled: boolean;
  /** Revision that was confirmed, or null. Valid only if equal to `revision`. */
  readonly confirmedRevision: number | null;
}

export interface SessionState {
  readonly fields: Readonly<Record<FieldId, FieldState>>;
  readonly inputRevision: number;
}

export type SessionEvent =
  | { type: 'changed'; id: FieldId; filled: boolean; source: FieldState['source'] }
  | { type: 'confirm'; id: FieldId }
  | { type: 'unconfirm'; id: FieldId }
  | { type: 'reset' };

const empty: FieldState = { revision: 0, source: 'manual', filled: false, confirmedRevision: null };

export function initialSession(): SessionState {
  return {
    fields: Object.fromEntries(FIELD_IDS.map((id) => [id, empty])) as Record<FieldId, FieldState>,
    inputRevision: 0,
  };
}

export const isConfirmed = (f: FieldState): boolean => f.filled && f.confirmedRevision === f.revision;

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'changed': {
      const f = state.fields[event.id];
      return {
        fields: {
          ...state.fields,
          [event.id]: { revision: f.revision + 1, source: event.source, filled: event.filled, confirmedRevision: null },
        },
        inputRevision: state.inputRevision + 1,
      };
    }
    case 'confirm': {
      const f = state.fields[event.id];
      if (!f.filled || f.confirmedRevision === f.revision) return state;
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

export type FieldValues = Record<FieldId, string>;

export const EMPTY_VALUES: FieldValues = Object.fromEntries(FIELD_IDS.map((id) => [id, ''])) as FieldValues;

/** Immutable snapshot of what goes into a PDF (architecture.md §7.5 PdfSnapshot). */
export interface PdfSnapshot {
  readonly inputRevision: number;
  readonly values: Readonly<Partial<Record<FieldId, string>>>;
  readonly excluded: readonly { id: FieldId; reason: 'empty' | 'unconfirmed' }[];
}

export function takeSnapshot(state: SessionState, current: Readonly<FieldValues>): PdfSnapshot {
  const values: Partial<Record<FieldId, string>> = {};
  const excluded: { id: FieldId; reason: 'empty' | 'unconfirmed' }[] = [];
  for (const id of FIELD_IDS) {
    const v = current[id];
    if (v === '') excluded.push({ id, reason: 'empty' });
    else if (!isConfirmed(state.fields[id])) excluded.push({ id, reason: 'unconfirmed' });
    else values[id] = v;
  }
  return Object.freeze({ inputRevision: state.inputRevision, values: Object.freeze(values), excluded: Object.freeze(excluded) });
}
