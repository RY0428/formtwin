import type { Dispatch } from 'react';
import { dateProblem, FIELD_IDS, FIELD_LABELS, formatProblem } from '../pii/session/fields.ts';
import { isConfirmed, type SessionEvent, type SessionState } from '../pii/session/sessionState.ts';

interface Props {
  state: SessionState;
  dispatch: Dispatch<SessionEvent>;
}

/** Manual entry and per-field confirmation. Editing a value withdraws its confirmation. */
export function FieldsForm({ state, dispatch }: Props) {
  const f = state.fields;
  const dateIssue = dateProblem(f.expiryYear.value, f.expiryMonth.value, f.expiryDay.value);
  return (
    <fieldset>
      <legend>Values for the form (page 1)</legend>
      {FIELD_IDS.map((id) => {
        const field = f[id];
        const problem = formatProblem(id, field.value);
        const confirmed = isConfirmed(field);
        const inputId = `field-${id}`;
        return (
          <div key={id} style={{ marginBottom: '0.75rem' }}>
            <label htmlFor={inputId}>{FIELD_LABELS[id]}</label>{' '}
            <input
              id={inputId}
              value={field.value}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={problem !== undefined}
              aria-describedby={problem === undefined ? undefined : `${inputId}-problem`}
              onChange={(e) => {
                dispatch({ type: 'edit', id, value: e.currentTarget.value });
              }}
            />{' '}
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                disabled={field.value === ''}
                onChange={(e) => {
                  dispatch({ type: e.currentTarget.checked ? 'confirm' : 'unconfirm', id });
                }}
              />{' '}
              Checked against my card
            </label>
            {problem !== undefined && (
              <span id={`${inputId}-problem`} role="alert">
                {' '}
                {problem}
              </span>
            )}
          </div>
        );
      })}
      {dateIssue !== undefined && <p role="alert">Expiry date: {dateIssue}</p>}
      <p>Format checks only show obvious mistakes. They do not prove a value is correct.</p>
    </fieldset>
  );
}
