import { useCallback, useMemo, useReducer } from 'react';
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
 * Session use cases (tech-stack.md §3): React Hook Form owns the values; every update goes
 * through these functions so revisions, confirmations and PDF validity stay consistent.
 * Values live in memory only (no persistence, no logging).
 */
export interface SessionForm {
  readonly state: SessionState;
  readonly values: Readonly<FieldValues>;
  /** Props for an input bound to the form; typing withdraws that field's confirmation. */
  readonly bind: (id: FieldId) => ReturnType<ReturnType<typeof useForm<FieldValues>>['register']>;
  readonly applyCandidate: (values: Partial<Record<FieldId, string>>) => void;
  readonly confirm: (id: FieldId) => void;
  readonly unconfirm: (id: FieldId) => void;
  readonly reset: () => void;
  readonly snapshot: () => PdfSnapshot;
}

export function useSessionForm(onManualEdit?: () => void): SessionForm {
  const form = useForm<FieldValues>({ defaultValues: EMPTY_VALUES, mode: 'onChange', shouldUnregister: false });
  const [state, dispatch] = useReducer(sessionReducer, undefined, initialSession);
  const values = useWatch({ control: form.control }) as FieldValues;

  const bind = useCallback(
    (id: FieldId) =>
      form.register(id, {
        onChange: (e: { target: { value: string } }) => {
          onManualEdit?.();
          dispatch({ type: 'changed', id, filled: e.target.value !== '', source: 'manual' });
        },
      }),
    [form, onManualEdit],
  );

  const applyCandidate = useCallback(
    (next: Partial<Record<FieldId, string>>) => {
      for (const id of FIELD_IDS) {
        const v = next[id];
        if (v === undefined) continue;
        if (form.getValues(id) === v && state.fields[id].source === 'candidate') continue;
        form.setValue(id, v, { shouldDirty: true });
        dispatch({ type: 'changed', id, filled: v !== '', source: 'candidate' });
      }
    },
    [form, state.fields],
  );

  return useMemo(
    () => ({
      state,
      values,
      bind,
      applyCandidate,
      confirm: (id: FieldId) => {
        if (form.getValues(id) !== '') dispatch({ type: 'confirm', id });
      },
      unconfirm: (id: FieldId) => {
        dispatch({ type: 'unconfirm', id });
      },
      reset: () => {
        form.reset(EMPTY_VALUES);
        dispatch({ type: 'reset' });
      },
      snapshot: () => takeSnapshot(state, form.getValues()),
    }),
    [state, values, bind, applyCandidate, form],
  );
}
