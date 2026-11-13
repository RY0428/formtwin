import type { ExtractionResult } from '@formtwin/contracts';
import { nameSplitOptions, splitDate } from '../pii/session/candidates.ts';
import { formatProblem, type FieldId } from '../pii/session/fields.ts';

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
    <div>
      <p role="status">Candidates are not confirmed. Check every value against the image.</p>
      <dl data-testid="result">
        {result.fields.map((f) => (
          <div key={f.key}>
            <dt>{f.key}</dt>
            <dd>{f.value ?? '(not read)'}</dd>
          </div>
        ))}
      </dl>
      <h3>Use a candidate</h3>
      <ul>
        {name !== null && splits.length === 0 && (
          <li>Name “{name}” has no space. Enter family and given name yourself.</li>
        )}
        {nameIssue !== undefined && (
          <li role="note" data-testid="name-warning">
            Name: {nameIssue}
          </li>
        )}
        {splits.map((s) => (
          <li key={s.family}>
            <button type="button" onClick={() => onApply({ familyName: s.family, givenName: s.given })}>
              Use name: family “{s.family}”, given “{s.given}”
            </button>
          </li>
        ))}
        {expiry !== null && date === undefined && <li>Expiry “{expiry}” could not be split. Enter it yourself.</li>}
        {date !== undefined && (
          <li>
            <button
              type="button"
              onClick={() => onApply({ expiryYear: date.year, expiryMonth: date.month, expiryDay: date.day })}
            >
              Use expiry: {date.year} / {date.month} / {date.day} (read as “{expiry}”)
            </button>
          </li>
        )}
        {number !== null && (
          <li>
            <button type="button" onClick={() => onApply({ residenceCardNumber: number })}>
              Use card number: {number}
            </button>
            {numberIssue !== undefined && (
              <span role="note" data-testid="number-warning">
                {' '}
                Check: {numberIssue}
              </span>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
