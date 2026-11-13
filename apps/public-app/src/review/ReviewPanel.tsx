import type { FormDefCandidate } from '@formtwin/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApprovedSource } from '../catalog/approvedSources.ts';
import type { AdoptedRevision } from '../catalog/adopted.ts';
import { Badge } from '../ui/components/badge.tsx';
import { Button } from '../ui/components/button.tsx';
import { compareWithAdopted, placementToBox, type Box } from './compare.ts';
import { renderPage } from './pdfRender.ts';

interface Props {
  source: ApprovedSource;
  adopted: AdoptedRevision;
  live?: { analysisRunId: string; model: string; promptVersion: string; candidate: FormDefCandidate } | undefined;
}

function Overlay({ box, tone, label }: { box: Box; tone: 'adopted' | 'live'; label: string }) {
  const [yMin, xMin, yMax, xMax] = box;
  return (
    <div
      data-testid={tone === 'adopted' ? 'overlay-adopted' : 'overlay-live'}
      title={label}
      className={
        tone === 'adopted'
          ? 'pointer-events-none absolute border-2 border-emerald-600 bg-emerald-400/15'
          : 'pointer-events-none absolute border-2 border-dashed border-amber-600 bg-amber-300/20'
      }
      style={{ top: `${yMin / 10}%`, left: `${xMin / 10}%`, height: `${(yMax - yMin) / 10}%`, width: `${(xMax - xMin) / 10}%` }}
    />
  );
}

/**
 * Review view (architecture.md §8.2): the approved original with the ADOPTED revision's fields and,
 * if present, a LIVE unadopted candidate on top; the comparison by semantic key; the adoption history;
 * and an export of the live candidate for the offline review script (scripts/forms/promote-forms.mjs).
 */
export function ReviewPanel({ source, adopted, live }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState<'rendering' | 'done' | 'failed'>('rendering');
  const pageIndex = adopted.formDef.page.index;

  useEffect(() => {
    let alive = true;
    const el = canvas.current;
    if (el === null) return undefined;
    renderPage(source.bytes, pageIndex, el, 900).then(
      (r) => {
        if (alive) setRendered(r ? 'done' : 'failed');
      },
      () => {
        if (alive) setRendered('failed');
      },
    );
    return () => {
      alive = false;
    };
  }, [source.bytes, pageIndex]);

  const comparison = useMemo(() => (live ? compareWithAdopted(live.candidate, adopted.formDef) : undefined), [live, adopted]);

  const exportUrl = useMemo(() => {
    if (!live) return undefined;
    const body = JSON.stringify(
      {
        formId: source.formId,
        sourceSha256: source.sha256,
        analysisRunId: live.analysisRunId,
        model: live.model,
        promptVersion: live.promptVersion,
        candidate: live.candidate,
      },
      null,
      2,
    );
    return URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  }, [live, source]);
  useEffect(
    () => () => {
      if (exportUrl) URL.revokeObjectURL(exportUrl);
    },
    [exportUrl],
  );

  const h = adopted.history;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <figure className="flex flex-col gap-2">
        <figcaption className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Original, page {pageIndex + 1}</span>
          <Badge variant="success">adopted rev {adopted.formDef.formDefRevision}</Badge>
          {live && <Badge variant="warning">live candidate (unadopted)</Badge>}
        </figcaption>
        <div className="relative overflow-hidden rounded-md border bg-white">
          <canvas ref={canvas} data-testid="review-canvas" data-state={rendered} role="img" aria-label="Approved original with field boxes" />
          {adopted.formDef.fields.map((f) => (
            <Overlay key={f.fieldId} tone="adopted" box={placementToBox(f.placement, adopted.formDef.page)} label={`${f.fieldId} (adopted)`} />
          ))}
          {live?.candidate.fields
            .filter((f) => f.page === pageIndex)
            .map((f, i) => <Overlay key={i} tone="live" box={f.box} label={`${f.labelJa} (live)`} />)}
        </div>
        <p className="text-xs text-muted-foreground">
          Solid green: adopted revision (the one the personal-entry app bundles in its signed package). Dashed amber: live cloud candidate, not adopted.
        </p>
      </figure>

      <div className="flex flex-col gap-4 text-sm">
        <section aria-labelledby="cmp-h" className="flex flex-col gap-2">
          <h3 id="cmp-h" className="font-semibold">
            Live candidate vs adopted revision
          </h3>
          {!comparison && <p className="text-muted-foreground">Run an analysis to compare.</p>}
          {comparison && (
            <>
              <ul data-testid="comparison" className="flex flex-col gap-1">
                {comparison.keys.map((k) => (
                  <li key={k.semanticKey} data-key={k.semanticKey} data-status={k.status}>
                    <span className="font-mono">{k.semanticKey}</span>:{' '}
                    {k.status === 'both' && (k.overlaps ? 'found at the adopted position' : 'found at a different position')}
                    {k.status === 'adopted_only' && 'missing in the candidate'}
                    {k.status === 'candidate_only' && 'only in the candidate'}
                    {k.status === 'neither' && 'not in either'}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                {comparison.otherCandidateFields} other candidate field(s) are unsupported or ambiguous. Agreement here is
                about layout only; it does not prove a mapping is correct.
              </p>
              {exportUrl && live && (
                <div>
                  <Button asChild variant="outline" size="sm">
                    <a href={exportUrl} download={`candidate-${live.analysisRunId}.json`}>
                      Export candidate for review
                    </a>
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="hist-h" className="flex flex-col gap-1" data-testid="history">
          <h3 id="hist-h" className="font-semibold">
            Adoption history (rev {h.formDefRevision})
          </h3>
          <p>
            Origin: <span className="font-mono">{h.origin}</span>
            {h.analysisRunId ? ` — run ${h.analysisRunId}, ${h.model ?? ''}, prompt ${h.promptVersion ?? ''}` : ' — no cloud candidate adopted'}
          </p>
          <p>
            Reviewed {h.review.reviewedOn} by {h.review.reviewerRole}.
          </p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {h.review.checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="text-muted-foreground">{h.changes.length} field change(s) recorded.</p>
        </section>
      </div>
    </div>
  );
}
