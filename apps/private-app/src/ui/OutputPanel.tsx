import { useEffect, useRef, useState } from 'react';
import type { FixedAssets } from '../bootstrap/fixedAssets.ts';
import { fillPdf } from '../pii/fill/fillPdf.ts';
import { FIELD_LABELS, type FieldId } from '../pii/session/fields.ts';
import type { SessionForm } from '../pii/session/useSessionForm.ts';
import { Alert } from './components/alert.tsx';
import { Button } from './components/button.tsx';
import { PdfPreview } from './PdfPreview.tsx';

interface Props {
  assets: FixedAssets;
  session: SessionForm;
}

interface Generated {
  readonly inputRevision: number;
  readonly url: string;
  readonly bytes: Uint8Array;
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
export function OutputPanel({ assets, session }: Props) {
  const state = session.state;
  const [generated, setGenerated] = useState<Generated | undefined>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // The panel is keyed on the session generation: once unmounted (session ended), a late PDF is dropped
  // before an object URL is created for it.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Invalidation notice lives in the session so that ending the session always clears it.
  const { pdfInvalidated: invalidated, setPdfInvalidated: setInvalidated } = session;

  const stale = generated !== undefined && generated.inputRevision !== state.inputRevision;

  useEffect(() => {
    if (!stale || generated === undefined) return;
    URL.revokeObjectURL(generated.url);
    setGenerated(undefined);
    setInvalidated(true);
  }, [stale, generated, setInvalidated]);

  useEffect(
    () => () => {
      if (generated !== undefined) URL.revokeObjectURL(generated.url);
    },
    [generated],
  );

  const onCreate = () => {
    const snapshot = session.snapshot();
    setBusy(true);
    setFailed(false);
    setInvalidated(false);
    fillPdf({ template: assets.template, font: assets.font, layout: assets.layout, values: snapshot.values }).then(
      (r) => {
        if (!mounted.current) return;
        setBusy(false);
        const left = [
          ...snapshot.excluded,
          ...r.notFilled.map((n) => ({ id: n.id as FieldId, reason: n.reason })),
        ];
        const url = URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: 'application/pdf' }));
        setGenerated({ inputRevision: snapshot.inputRevision, url, bytes: r.bytes, left });
      },
      () => {
        setBusy(false);
        setFailed(true);
      },
    );
  };

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div>
        <Button type="button" onClick={onCreate} disabled={busy}>
          Create PDF
        </Button>
      </div>
      {busy && <p role="status">Creating PDF…</p>}
      {failed && (
        <Alert variant="destructive" role="alert">
          The PDF could not be created.
        </Alert>
      )}
      {(stale || invalidated) && (
        <Alert variant="warning" role="status">
          Values changed. Create the PDF again.
        </Alert>
      )}
      {generated !== undefined && !stale && (
        <div data-testid="pdf-ready" className="flex flex-col gap-3">
          <Alert variant="warning" role="status">
            This PDF is <strong>partially filled</strong>. It is not complete and not ready to submit.
          </Alert>
          {generated.left.length > 0 && (
            <>
              <p className="text-sm font-medium">Left blank:</p>
              <ul data-testid="left-blank" className="list-disc pl-5 text-sm">
                {generated.left.map((l) => (
                  <li key={`${l.id}-${l.reason}`}>
                    {FIELD_LABELS[l.id]} — {REASON[l.reason] ?? l.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          <PdfPreview bytes={generated.bytes} />
          <div>
            <Button asChild>
              <a href={generated.url} download="formtwin-filled-form.pdf">
                Save PDF
              </a>
            </Button>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-sm" data-testid="print-guidance">
            <p className="font-medium">Before you submit the paper form</p>
            <ul className="mt-1 list-disc pl-5">
              <li>
                Print on A4 paper, one side only. Guidance from immigration practitioners says the signature box
                should be signed by hand (black or blue pen); this app does not fill in the signature or the date.
              </li>
              <li>
                Only the fields listed in step 4 are filled, on page 1. Complete the other fields, and the pages for
                your status of residence, yourself. Check the latest instructions from the Immigration Services
                Agency or your regional immigration office.
              </li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            A saved PDF stays on your device and is not changed by later edits here. You entered these values with
            FormTwin; the form is not checked by the Immigration Services Agency.
          </p>
        </div>
      )}
    </div>
  );
}
