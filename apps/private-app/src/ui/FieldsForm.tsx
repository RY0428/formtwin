import { dateProblem, FIELD_IDS, FIELD_LABELS, formatProblem } from '../pii/session/fields.ts';
import { isConfirmed } from '../pii/session/sessionState.ts';
import type { SessionForm } from '../pii/session/useSessionForm.ts';
import { Alert } from './components/alert.tsx';
import { cn } from './components/cn.ts';
import { Input } from './components/input.tsx';

interface Props {
  session: SessionForm;
}

/** Manual entry and per-field confirmation. Editing a value withdraws its confirmation. */
export function FieldsForm({ session }: Props) {
  const v = session.values;
  const dateIssue = dateProblem(v.expiryYear, v.expiryMonth, v.expiryDay);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium text-muted-foreground">Values for the form (page 1)</legend>
      {FIELD_IDS.map((id) => {
        const field = session.state.fields[id];
        const value = v[id];
        const problem = formatProblem(id, value);
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
              autoComplete="off"
              spellCheck={false}
              aria-invalid={problem !== undefined}
              aria-describedby={problem === undefined ? undefined : `${inputId}-problem`}
              {...session.bind(id)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={!field.filled}
                onChange={(e) => {
                  if (e.currentTarget.checked) session.confirm(id);
                  else session.unconfirm(id);
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
      <p className="text-xs text-muted-foreground">
        Format checks only show obvious mistakes. They do not prove a value is correct.
      </p>
    </fieldset>
  );
}
