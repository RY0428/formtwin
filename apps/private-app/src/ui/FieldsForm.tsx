import type { Dispatch } from 'react';
import { Alert } from './components/alert.tsx';
import { Input } from './components/input.tsx';
import { cn } from './components/cn.ts';
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
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium text-muted-foreground">Values for the form (page 1)</legend>
      {FIELD_IDS.map((id) => {
        const field = f[id];
        const problem = formatProblem(id, field.value);
        const confirmed = isConfirmed(field);
        const inputId = `field-${id}`;
        return (
          <div
            key={id}
            className={cn(
              'grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto] sm:items-end',
              confirmed ? 'border-emerald-300 bg-emerald-50/50' : 'bg-white',
            )}
          >
            <label htmlFor={inputId} className="text-sm font-medium sm:col-span-2">
              {FIELD_LABELS[id]}
            </label>
            <Input
              id={inputId}
              value={field.value}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={problem !== undefined}
              aria-describedby={problem === undefined ? undefined : `${inputId}-problem`}
              onChange={(e) => {
                dispatch({ type: 'edit', id, value: e.currentTarget.value });
              }}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={field.value === ''}
                onChange={(e) => {
                  dispatch({ type: e.currentTarget.checked ? 'confirm' : 'unconfirm', id });
                }}
              />
              Checked against my card
            </label>
            {problem !== undefined && (
              <span id={`${inputId}-problem`} role="alert" className="text-sm text-destructive sm:col-span-2">
                {problem}
              </span>
            )}
          </div>
        );
      })}
      {dateIssue !== undefined && (
        <Alert variant="destructive" role="alert">
          Expiry date: {dateIssue}
        </Alert>
      )}
      <p className="text-xs text-muted-foreground">Format checks only show obvious mistakes. They do not prove a value is correct.</p>
    </fieldset>
  );
}
