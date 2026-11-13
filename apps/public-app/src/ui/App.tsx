import type { FormDefCandidate } from '@formtwin/contracts';
import { createCloudFormAnalyzer } from '#cloud-impl';
import { useMemo, useState } from 'react';
import { APPROVED_FORM_IDS, resolveApprovedSource } from '../catalog/approvedSources.ts';
import { EgressGateway, FORM_ANALYSIS_PROMPT_VERSION, type RequestLogEntry } from '../egress/gateway.ts';

interface CandidateView {
  readonly analysisRunId: string;
  readonly candidate: FormDefCandidate;
}

const REASON_TEXT: Record<string, string> = {
  not_approved: 'This form is not on the approved list. Nothing was sent.',
  hash_mismatch: 'The bundled original does not match its approved hash. Nothing was sent.',
  busy: 'An analysis is already running.',
  request_failed: 'The cloud request failed. It may or may not have reached the service.',
  source_mismatch: 'The response did not come from cloud inference and was discarded.',
  invalid_output: 'The response did not match the expected structure and was discarded.',
};

export function App() {
  const [log, setLog] = useState<readonly RequestLogEntry[]>([]);
  const gateway = useMemo(() => new EgressGateway(createCloudFormAnalyzer(), setLog), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<CandidateView | null>(null);
  const formId = APPROVED_FORM_IDS[0];
  const source = resolveApprovedSource(formId);

  async function analyze() {
    setBusy(true);
    setError(null);
    setView(null);
    const out = await gateway.analyzeApprovedForm(formId);
    if (out.ok) setView({ analysisRunId: out.analysisRunId, candidate: out.candidate });
    else setError(REASON_TEXT[out.reason] ?? 'Analysis failed.');
    setBusy(false);
  }

  return (
    <main>
      <h1>FormTwin — Public form analysis</h1>
      <p>
        This app analyzes approved blank public forms only. It never accepts personal documents or filled
        forms. Analysis runs in the cloud (Firebase AI Logic, cloud only).
      </p>

      <section aria-labelledby="source-h">
        <h2 id="source-h">Approved original</h2>
        {source && (
          <dl>
            <dt>Form ID</dt>
            <dd data-testid="form-id">{source.formId}</dd>
            <dt>Title</dt>
            <dd>{source.title}</dd>
            <dt>Issuer</dt>
            <dd>{source.issuer}</dd>
            <dt>Source</dt>
            <dd>
              {source.sourceUrl} (retrieved {source.retrievedOn}, {source.license})
            </dd>
            <dt>SHA-256</dt>
            <dd>
              <code data-testid="source-sha">{source.sha256}</code>
            </dd>
            <dt>Pages analyzed</dt>
            <dd>{source.targetPages.map((p) => p + 1).join(', ')}</dd>
          </dl>
        )}
        <button type="button" onClick={() => void analyze()} disabled={busy}>
          {busy ? 'Analyzing…' : 'Analyze in the cloud'}
        </button>
        <p>Prompt version: {FORM_ANALYSIS_PROMPT_VERSION}</p>
      </section>

      <div role="status" aria-live="polite">
        {error && (
          <p role="alert" data-testid="analysis-error">
            {error}
          </p>
        )}
      </div>

      {view && (
        <section aria-labelledby="cand-h" data-testid="candidate">
          <h2 id="cand-h">Unadopted candidate</h2>
          <p>
            Live result <code data-testid="run-id">{view.analysisRunId}</code>. It is not reviewed and is not used by
            the personal-entry app. Only a reviewed and signed revision is bundled there.
          </p>
          <table>
            <thead>
              <tr>
                <th scope="col">Label (printed)</th>
                <th scope="col">Label (English)</th>
                <th scope="col">Kind</th>
                <th scope="col">Semantic key</th>
                <th scope="col">Status</th>
                <th scope="col">Page</th>
                <th scope="col">Box (0–1000)</th>
              </tr>
            </thead>
            <tbody>
              {view.candidate.fields.map((f, i) => (
                <tr key={i} data-testid="candidate-field">
                  <td lang="ja">{f.labelJa}</td>
                  <td>{f.labelEn}</td>
                  <td>{f.kind}</td>
                  <td>{f.semanticKey ?? '—'}</td>
                  <td>{f.status}</td>
                  <td>{f.page + 1}</td>
                  <td>{f.box.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section aria-labelledby="log-h">
        <h2 id="log-h">Requests this app allowed</h2>
        <p>Logical requests built by this app. SDK headers and token traffic are not shown here.</p>
        <ol data-testid="request-log">
          {log.map((e) => (
            <li key={e.seq} data-status={e.status}>
              {e.status} — form {e.formId ?? '(none)'} — prompt {e.promptVersion} — model {e.model} — to {e.endpointHost}
              {e.reason ? ` — ${e.reason}` : ''}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
