import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { FIELD_IDS, type FieldId } from './fields.ts';
import {
  EMPTY_VALUES,
  initialSession,
  sessionReducer,
  takeSnapshot,
  type FieldValues,
  type PdfSnapshot,
  type SessionState,
} from './sessionState.ts';

/**
 * Session use cases (tech-stack.md §3): React Hook Form owns the values; this hook keeps the
 * revision/confirmation state consistent with them.
 *
 * Every value change is detected by comparing the watched values with the last values seen, not
 * only through input event callbacks, so no input path (IME, paste, autofill, programmatic set) can
 * change a value without withdrawing its confirmation (architecture.md §7.4). Values live in memory only.
 */
export interface SessionForm {
  readonly state: SessionState;
  /** Increases on every session end; UI parts keyed on it start fresh. */
  readonly generation: number;
  /** A generated PDF was invalidated by an edit (cleared by a new PDF or by ending the session). */
  readonly pdfInvalidated: boolean;
  readonly setPdfInvalidated: (value: boolean) => void;
  readonly values: Readonly<FieldValues>;
  /** Props for an input bound to the form. */
  readonly bind: (id: FieldId) => ReturnType<ReturnType<typeof useForm<FieldValues>>['register']>;
  readonly applyCandidate: (values: Partial<Record<FieldId, string>>) => void;
  readonly confirm: (id: FieldId) => void;
  readonly unconfirm: (id: FieldId) => void;
  readonly reset: () => void;
  readonly snapshot: () => PdfSnapshot;
}

export function useSessionForm(onManualEdit?: () => void): SessionForm {
  const form = useForm<FieldValues>({ defaultValues: EMPTY_VALUES, shouldUnregister: false });
  const [state, dispatch] = useReducer(sessionReducer, undefined, initialSession);
  const values = { ...EMPTY_VALUES, ...(useWatch({ control: form.control }) as Partial<FieldValues>) };
  const [generation, setGeneration] = useState(0);
  const [pdfInvalidated, setPdfInvalidated] = useState(false);
  const seen = useRef<FieldValues>(EMPTY_VALUES);
  /** Fields whose next change comes from an explicitly chosen candidate. */
  const pendingCandidate = useRef(new Set<FieldId>());
  const manualEdit = useRef(onManualEdit);
  manualEdit.current = onManualEdit;

  const key = FIELD_IDS.map((id) => values[id]).join('\u0000');
  useEffect(() => {
    const current = form.getValues();
    let manual = false;
    for (const id of FIELD_IDS) {
      const v = current[id] ?? '';
      if (v === seen.current[id]) continue;
      const source = pendingCandidate.current.delete(id) ? 'candidate' : 'manual';
      if (source === 'manual') manual = true;
      dispatch({ type: 'changed', id, filled: v !== '', source });
    }
    seen.current = { ...EMPTY_VALUES, ...current };
    if (manual) manualEdit.current?.();
  }, [key, form]);

  return useMemo(
    () => ({
      state,
      generation,
      pdfInvalidated,
      setPdfInvalidated,
      values,
      bind: (id: FieldId) => form.register(id),
      applyCandidate: (next: Partial<Record<FieldId, string>>) => {
        for (const id of FIELD_IDS) {
          const v = next[id];
          if (v === undefined || form.getValues(id) === v) continue;
          pendingCandidate.current.add(id);
          form.setValue(id, v, { shouldDirty: true });
        }
      },
      confirm: (id: FieldId) => {
        // Confirm only the value the reducer has already registered (same revision as on screen).
        if (form.getValues(id) !== '' && form.getValues(id) === seen.current[id]) dispatch({ type: 'confirm', id });
      },
      unconfirm: (id: FieldId) => {
        dispatch({ type: 'unconfirm', id });
      },
      reset: () => {
        // The reducer reset below already covers the cleared values; do not report them as edits.
        seen.current = EMPTY_VALUES;
        pendingCandidate.current.clear();
        form.reset(EMPTY_VALUES);
        dispatch({ type: 'reset' });
        setGeneration((g) => g + 1);
        setPdfInvalidated(false);
      },
      snapshot: () => {
        const current = { ...EMPTY_VALUES, ...form.getValues() };
        // A value not yet registered by the reducer is treated as unconfirmed.
        const settled = FIELD_IDS.every((id) => current[id] === seen.current[id]);
        return settled ? takeSnapshot(state, current) : takeSnapshot(initialSessionLike(state), current);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `values` is derived from `key`
    [state, key, form, generation, pdfInvalidated],
  );
}

/** Same revisions with every confirmation withdrawn (used only for a not-yet-settled snapshot). */
function initialSessionLike(state: SessionState): SessionState {
  return {
    inputRevision: state.inputRevision,
    fields: Object.fromEntries(
      FIELD_IDS.map((id) => [id, { ...state.fields[id], confirmedRevision: null }]),
    ) as SessionState['fields'],
  };
}
