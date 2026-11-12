import { useEffect, useState } from 'react';
import type { FixedAssets } from '../bootstrap/fixedAssets.ts';
import { fillPdf } from '../pii/fill/fillPdf.ts';
import { FIELD_LABELS, type FieldId } from '../pii/session/fields.ts';
import { takeSnapshot, type SessionState } from '../pii/session/sessionState.ts';

interface Props {
  assets: FixedAssets;
  state: SessionState;
}

interface Generated {
  readonly inputRevision: number;
  readonly url: string;
  readonly left: readonly { id: FieldId; reason: string }[];
}

const REASON: Record<string, string> = {
  empty: 'empty',
  unconfirmed: 'not checked',
  overflow: 'does not fit the field',
  unsupported_char: 'contains a character the font cannot print',
  type_mismatch: 'invalid',
  missing_field: 'no place on the form',
};

/** PDF generation from an immutable snapshot; stale results are discarded (architecture.md §7.5). */
export function OutputPanel({ assets, state }: Props) {
  const [generated, setGenerated] = useState<Generated | undefined>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const stale = generated !== undefined && generated.inputRevision !== state.inputRevision;

  useEffect(() => {
    if (!stale || generated === undefined) return;
    URL.revokeObjectURL(generated.url);
    setGenerated(undefined);
  }, [stale, generated]);

  useEffect(
    () => () => {
      if (generated !== undefined) URL.revokeObjectURL(generated.url);
    },
    [generated],
  );

  const onCreate = () => {
    const snapshot = takeSnapshot(state);
    setBusy(true);
    setFailed(false);
    fillPdf({ template: assets.template, font: assets.font, layout: assets.layout, values: snapshot.values }).then(
      (r) => {
        setBusy(false);
        const left = [
          ...snapshot.excluded,
          ...r.notFilled.map((n) => ({ id: n.id as FieldId, reason: n.reason })),
        ];
        const url = URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: 'application/pdf' }));
        setGenerated({ inputRevision: snapshot.inputRevision, url, left });
      },
      () => {
        setBusy(false);
        setFailed(true);
      },
    );
  };

  return (
    <div>
      <button type="button" onClick={onCreate} disabled={busy}>
        Create PDF
      </button>
      {busy && <p role="status">Creating PDF…</p>}
      {failed && <p role="alert">The PDF could not be created.</p>}
      {stale && <p role="status">Values changed. Create the PDF again.</p>}
      {generated !== undefined && !stale && (
        <div data-testid="pdf-ready">
          <p role="status">
            This PDF is <strong>partially filled</strong>. It is not complete and not ready to submit.
          </p>
          {generated.left.length > 0 && (
            <>
              <p>Left blank:</p>
              <ul data-testid="left-blank">
                {generated.left.map((l) => (
                  <li key={`${l.id}-${l.reason}`}>
                    {FIELD_LABELS[l.id]} — {REASON[l.reason] ?? l.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p>
            <a href={generated.url} download="formtwin-filled-form.pdf">
              Save PDF
            </a>
          </p>
          <p>
            A saved PDF stays on your device and is not changed by later edits here. You entered these values with
            FormTwin; the form is not checked by the Immigration Services Agency.
          </p>
        </div>
      )}
    </div>
  );
}
