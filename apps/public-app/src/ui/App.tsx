import type { FormDefCandidate } from '@formtwin/contracts';
import { createCloudFormAnalyzer } from '#cloud-impl';
import { useMemo, useState } from 'react';
import { adoptedRevisionFor } from '../catalog/adopted.ts';
import { APPROVED_FORM_IDS, resolveApprovedSource } from '../catalog/approvedSources.ts';
import { ReviewPanel } from '../review/ReviewPanel.tsx';
import {
  EgressGateway,
  FORM_ANALYSIS_PROMPT_VERSION,
  type DiagnosticResult,
  type RequestLogEntry,
} from '../egress/gateway.ts';
import { Alert } from './components/alert.tsx';
import { Badge } from './components/badge.tsx';
import { Button } from './components/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/card.tsx';

interface CandidateView {
  readonly analysisRunId: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly candidate: FormDefCandidate;
}

const REASON_TEXT: Record<string, string> = {
  not_approved: 'This form is not on the approved list. Nothing was sent.',
  hash_mismatch: 'The bundled original does not match its approved hash. Nothing was sent.',
  busy: 'An analysis is already running.',
  request_failed: 'The cloud request failed. It may or may not have reached the service.',
  source_mismatch: 'The response did not come from cloud inference and was discarded.',
  invalid_output: 'The response did not match the expected structure and was discarded.',
  rate_limited: 'Too many requests. Wait a minute, then try again. This app does not retry automatically.',
};

export function App() {
  const [log, setLog] = useState<readonly RequestLogEntry[]>([]);
  const gateway = useMemo(() => new EgressGateway(createCloudFormAnalyzer(), setLog), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<CandidateView | null>(null);
  const [diag, setDiag] = useState<readonly DiagnosticResult[] | string | null>(null);
  const formId = APPROVED_FORM_IDS[0];
  const source = resolveApprovedSource(formId);
  const adopted = formId === undefined ? undefined : adoptedRevisionFor(formId);

  async function analyze() {
    setBusy(true);
    setError(null);
    setView(null);
    const out = await gateway.analyzeApprovedForm(formId);
    if (out.ok)
      setView({
        analysisRunId: out.analysisRunId,
        model: out.model,
        promptVersion: out.promptVersion,
        candidate: out.candidate,
      });
    else setError((REASON_TEXT[out.reason] ?? 'Analysis failed.') + (out.detail ? ` Details: ${out.detail}` : ''));
    setBusy(false);
  }

  async function runDiagnostics() {
    setBusy(true);
    setDiag(null);
    setDiag(await gateway.diagnoseApprovedForm(formId));
    setBusy(false);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-primary">FormTwin — Public form analysis</h1>
            <p className="text-sm text-muted-foreground">Cloud analysis of approved blank forms only</p>
          </div>
          <Badge variant="secondary">Firebase AI Logic · cloud only · build {__APP_COMMIT__}</Badge>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6">
        <Alert variant="info">
          This app analyzes approved blank public forms only. It never accepts personal documents or filled forms.
          Analysis runs in the cloud (Firebase AI Logic, cloud only).
        </Alert>

        <Card aria-labelledby="source-h">
          <CardHeader>
            <CardTitle id="source-h">Approved original</CardTitle>
            <CardDescription>The only document this app can send.</CardDescription>
          </CardHeader>
          <CardContent>
            {source && (
              <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="text-muted-foreground">Form ID</dt>
                <dd data-testid="form-id">{source.formId}</dd>
                <dt className="text-muted-foreground">Title</dt>
                <dd>{source.title}</dd>
                <dt className="text-muted-foreground">Issuer</dt>
                <dd>{source.issuer}</dd>
                <dt className="text-muted-foreground">Source</dt>
                <dd className="break-all">
                  {source.sourceUrl} (retrieved {source.retrievedOn}, {source.license})
                </dd>
                <dt className="text-muted-foreground">SHA-256</dt>
                <dd>
                  <code data-testid="source-sha" className="break-all text-xs">
                    {source.sha256}
                  </code>
                </dd>
                <dt className="text-muted-foreground">Pages analyzed</dt>
                <dd>{source.targetPages.map((p) => p + 1).join(', ')}</dd>
              </dl>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={() => void analyze()} disabled={busy}>
                {busy ? 'Analyzing…' : 'Analyze in the cloud'}
              </Button>
              <span className="text-xs text-muted-foreground">Prompt version: {FORM_ANALYSIS_PROMPT_VERSION}</span>
            </div>
          </CardContent>
        </Card>

        <div role="status" aria-live="polite">
          {error && (
            <Alert variant="destructive" role="alert" data-testid="analysis-error">
              {error}
            </Alert>
          )}
        </div>

        {view && (
          <Card aria-labelledby="cand-h" data-testid="candidate">
            <CardHeader>
              <CardTitle id="cand-h">Unadopted candidate</CardTitle>
              <CardDescription>
                Live result <code data-testid="run-id">{view.analysisRunId}</code>. It is not reviewed and is not used
                by the personal-entry app. Only a reviewed and signed revision is bundled there.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-3">Label (printed)</th>
                    <th scope="col" className="py-2 pr-3">Label (English)</th>
                    <th scope="col" className="py-2 pr-3">Kind</th>
                    <th scope="col" className="py-2 pr-3">Semantic key</th>
                    <th scope="col" className="py-2 pr-3">Status</th>
                    <th scope="col" className="py-2 pr-3">Page</th>
                    <th scope="col" className="py-2">Box (0–1000)</th>
                  </tr>
                </thead>
                <tbody>
                  {view.candidate.fields.map((f, i) => (
                    <tr key={i} data-testid="candidate-field" className="border-b last:border-0">
                      <td lang="ja" className="py-2 pr-3">{f.labelJa}</td>
                      <td className="py-2 pr-3">{f.labelEn}</td>
                      <td className="py-2 pr-3">{f.kind}</td>
                      <td className="py-2 pr-3">{f.semanticKey ?? '—'}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={f.status === 'resolved' ? 'success' : f.status === 'ambiguous' ? 'warning' : 'outline'}>
                          {f.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">{f.page + 1}</td>
                      <td className="py-2 font-mono text-xs">{f.box.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {source && adopted && (
          <Card aria-labelledby="review-h">
            <CardHeader>
              <CardTitle id="review-h">Review: original, adopted revision and live candidate</CardTitle>
              <CardDescription>
                The personal-entry app bundles only the adopted, signed revision. A live candidate becomes part of it
                only after human review, a new revision and a new signature.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReviewPanel source={source} adopted={adopted} live={view ?? undefined} />
            </CardContent>
          </Card>
        )}

        <details className="rounded-xl border bg-white p-4 text-sm" data-testid="diagnostics">
          <summary className="cursor-pointer font-medium">Diagnostics (cloud request variants)</summary>
          <p className="mt-2 text-muted-foreground">
            Sends the same approved original and prompt once per fixed output configuration (6 requests), to find which
            configuration the service rejects. Only the approved original is sent.
          </p>
          <div className="mt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void runDiagnostics()} disabled={busy}>
              {busy ? 'Running…' : 'Run diagnostics'}
            </Button>
          </div>
          {typeof diag === 'string' && <p className="mt-2 text-destructive">Not run: {diag}</p>}
          {Array.isArray(diag) && (
            <table className="mt-3 w-full text-left text-xs">
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1 pr-2">Variant</th>
                  <th scope="col" className="py-1 pr-2">Outcome</th>
                  <th scope="col" className="py-1 pr-2">Valid candidate</th>
                  <th scope="col" className="py-1 pr-2">Fields</th>
                  <th scope="col" className="py-1 pr-2">ms</th>
                  <th scope="col" className="py-1">Detail</th>
                </tr>
              </thead>
              <tbody>
                {diag.map((d) => (
                  <tr key={d.variant} data-testid="diag-row" data-variant={d.variant} data-outcome={d.outcome} className="border-b align-top">
                    <td className="py-1 pr-2 font-mono">{d.variant}</td>
                    <td className="py-1 pr-2">{d.outcome}</td>
                    <td className="py-1 pr-2">{d.validCandidate === null ? '—' : d.validCandidate ? 'yes' : 'no'}</td>
                    <td className="py-1 pr-2">{d.fieldCount ?? '—'}</td>
                    <td className="py-1 pr-2">{d.ms}</td>
                    <td className="break-all py-1">{d.detail ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </details>

        <Card aria-labelledby="log-h">
          <CardHeader>
            <CardTitle id="log-h">Requests this app allowed</CardTitle>
            <CardDescription>
              Logical requests built by this app. SDK headers and token traffic are not shown here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol data-testid="request-log" className="flex flex-col gap-1 font-mono text-xs">
              {log.length === 0 && <li className="text-muted-foreground">No requests yet.</li>}
              {log.map((e) => (
                <li key={e.seq} data-status={e.status}>
                  {e.status} — form {e.formId ?? '(none)'} — prompt {e.promptVersion} — model {e.model} — to{' '}
                  {e.endpointHost}
                  {e.reason ? ` — ${e.reason}` : ''}
                  {e.detail ? ` — ${e.detail}` : ''}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
