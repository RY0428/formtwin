import type { ExtractionResult } from '@formtwin/contracts';
import { nameSplitOptions, splitDate } from '../pii/session/candidates.ts';
import { formatProblem, type FieldId } from '../pii/session/fields.ts';
import { Alert } from './components/alert.tsx';
import { Button } from './components/button.tsx';

interface Props {
  result: ExtractionResult;
  onApply: (values: Partial<Record<FieldId, string>>) => void;
}

/** Shows on-device candidates. Nothing is applied until the person chooses. */
export function CandidatesPanel({ result, onApply }: Props) {
  const get = (key: string) => result.fields.find((f) => f.key === key)?.value ?? null;
  const name = get('fullName');
  const number = get('residenceCardNumber');
  const expiry = get('periodOfStayExpiry');
  const date = expiry === null ? undefined : splitDate(expiry);
  const splits = name === null ? [] : nameSplitOptions(name);
  const nameIssue = splits.length > 0 ? formatProblem('familyName', name ?? '') : undefined;
  const numberIssue = number === null ? undefined : formatProblem('residenceCardNumber', number);

  return (
    <div className="flex flex-col gap-3">
      <Alert variant="warning" role="status">
        Candidates are not confirmed. Check every value against the image.
      </Alert>
      <dl data-testid="result" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-muted p-3 text-sm">
        {result.fields.map((f) => (
          <div key={f.key} className="contents">
            <dt className="text-muted-foreground">{f.key}</dt>
            <dd className="font-mono">{f.value ?? '(not read)'}</dd>
          </div>
        ))}
      </dl>
      <h3 className="text-sm font-semibold">Use a candidate</h3>
      <ul className="flex flex-col gap-2 text-sm">
        {name !== null && splits.length === 0 && (
          <li>Name “{name}” has no space. Enter family and given name yourself.</li>
        )}
        {nameIssue !== undefined && (
          <li role="note" data-testid="name-warning" className="text-amber-800">
            Name: {nameIssue}
          </li>
        )}
        {splits.map((s) => (
          <li key={s.family}>
            <Button type="button" variant="secondary" onClick={() => onApply({ familyName: s.family, givenName: s.given })}>
              Use name: family “{s.family}”, given “{s.given}”
            </Button>
          </li>
        ))}
        {expiry !== null && date === undefined && <li>Expiry “{expiry}” could not be split. Enter it yourself.</li>}
        {date !== undefined && (
          <li>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onApply({ expiryYear: date.year, expiryMonth: date.month, expiryDay: date.day })}
            >
              Use expiry: {date.year} / {date.month} / {date.day} (read as “{expiry}”)
            </Button>
          </li>
        )}
        {number !== null && (
          <li>
            <Button type="button" variant="secondary" onClick={() => onApply({ residenceCardNumber: number })}>
              Use card number: {number}
            </Button>
            {numberIssue !== undefined && (
              <span role="note" data-testid="number-warning" className="ml-2 text-amber-800">
                Check: {numberIssue}
              </span>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
