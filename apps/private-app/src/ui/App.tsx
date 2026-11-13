import type { ExtractionResult } from '@formtwin/contracts';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { prepareFixedAssets, type FixedAssets } from '../bootstrap/fixedAssets.ts';
import { PackageError } from '../packages/verifyPackage.ts';
import {
  EXTRACTION_PROMPT_VERSION,
  FIREBASE_SDK_VERSION,
  FirebaseOnDeviceLLM,
  OnDeviceError,
  aiReducer,
  canExtract,
  initialAiState,
  type DeviceAvailability,
} from '../ondevice/index.ts';
import { ImageRejectedError, prepareImage, type PreparedImage } from '../pii/extract/imageInput.ts';
import { ExtractionRequests } from '../pii/extract/requests.ts';
import { FIELD_IDS } from '../pii/session/fields.ts';
import { isConfirmed } from '../pii/session/sessionState.ts';
import { useSessionForm } from '../pii/session/useSessionForm.ts';
import { CandidatesPanel } from './CandidatesPanel.tsx';
import { FieldsForm } from './FieldsForm.tsx';
import { OutputPanel } from './OutputPanel.tsx';
import { Alert } from './components/alert.tsx';
import { Badge } from './components/badge.tsx';
import { Button } from './components/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/card.tsx';
import { Input } from './components/input.tsx';
import { COPY } from './copy.ts';

/**
 * Applicant screen (S5 working flow). Personal data lives in React state only:
 * never logged, never put in URLs or storage.
 */
const llm = new FirebaseOnDeviceLLM();

interface Timing {
  readonly prepareMs?: number;
  readonly extractMs?: number;
  /** Candidates shown → all fields checked (docs/eval/protocol.md §4). */
  readonly confirmMs?: number | undefined;
  /** First manual edit without candidates → all fields checked (baseline). */
  readonly manualMs?: number | undefined;
}

/** Start point of the correction-time measurement. Timing only; no personal data. */
type ConfirmClock = { readonly kind: 'candidates' | 'manual'; readonly startedAt: number } | undefined;

type Bootstrap =
  | { status: 'preparing' }
  | { status: 'ready'; assets: FixedAssets }
  | { status: 'failed'; reason: string };

const FORM_TITLE = 'Application for Extension of Period of Stay (Form 30-2, applicant part 1)';

function failureCode(e: unknown): string {
  if (e instanceof OnDeviceError) return e.code;
  if (e instanceof ImageRejectedError) return `image_${e.reason}`;
  if (e instanceof Error && e.message === 'firebase-config-missing') return 'config_missing';
  return 'unknown';
}

export function App() {
  const [boot, setBoot] = useState<Bootstrap>({ status: 'preparing' });
  const [ai, dispatchAi] = useReducer(aiReducer, initialAiState);
  const [availability, setAvailability] = useState<DeviceAvailability | 'checking'>('checking');
  const [image, setImage] = useState<PreparedImage | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [result, setResult] = useState<ExtractionResult | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [timing, setTiming] = useState<Timing>({});
  const [ended, setEnded] = useState(false);
  const requests = useRef(new ExtractionRequests());
  const fileInput = useRef<HTMLInputElement>(null);
  const confirmClock = useRef<ConfirmClock>(undefined);
  const hasResult = useRef(false);
  const onManualEdit = useCallback(() => {
    setEnded(false);
    if (confirmClock.current === undefined && !hasResult.current) {
      confirmClock.current = { kind: 'manual', startedAt: performance.now() };
      setTiming((t) => ({ ...t, manualMs: undefined }));
    }
  }, []);
  const session = useSessionForm(onManualEdit);
  useEffect(() => {
    hasResult.current = result !== undefined;
  }, [result]);
  const sessionState = session.state;

  useEffect(() => {
    const clock = confirmClock.current;
    if (clock === undefined) return;
    if (!FIELD_IDS.every((id) => isConfirmed(sessionState.fields[id]))) return;
    const ms = performance.now() - clock.startedAt;
    confirmClock.current = undefined;
    setTiming((t) => (clock.kind === 'candidates' ? { ...t, confirmMs: ms } : { ...t, manualMs: ms }));
  }, [sessionState]);

  useEffect(() => {
    let live = true;
    prepareFixedAssets().then(
      (assets) => {
        if (live) setBoot({ status: 'ready', assets });
      },
      (e: unknown) => {
        if (live) setBoot({ status: 'failed', reason: e instanceof PackageError ? e.code : 'assets_invalid' });
      },
    );
    llm.availability().then(
      (a) => {
        if (live) setAvailability(a);
      },
      () => {
        if (live) setAvailability('unavailable');
      },
    );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (image === undefined) return undefined;
    const url = URL.createObjectURL(image.blob);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [image]);

  const onPrepare = useCallback(() => {
    const attempt = ai.attempt + 1;
    dispatchAi({ type: 'start' });
    const started = performance.now();
    llm
      .prepare((fraction) => {
        dispatchAi({ type: 'progress', attempt, fraction });
      })
      .then(
        () => {
          setTiming((t) => ({ ...t, prepareMs: performance.now() - started }));
          dispatchAi({ type: 'succeeded', attempt });
        },
        (e: unknown) => {
          const code = failureCode(e);
          dispatchAi(
            code === 'api_missing' || code === 'unavailable'
              ? { type: 'unavailable', attempt, reason: code }
              : { type: 'failed', attempt, reason: code },
          );
        },
      );
  }, [ai.attempt]);

  const onFile = useCallback((file: File | undefined) => {
    requests.current.newDocument();
    setResult(undefined);
    setError(undefined);
    setImage(undefined);
    setPreviewUrl(undefined);
    if (file === undefined) return;
    prepareImage(file).then(setImage, (e: unknown) => {
      setError(failureCode(e));
    });
  }, []);

  const onExtract = useCallback(() => {
    if (image === undefined) return;
    const request = requests.current.begin();
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    const started = performance.now();
    llm.extract(image).then(
      (r) => {
        // The model call cannot be aborted; it occupies the queue until it returns (one at a time).
        setBusy(false);
        if (!requests.current.settle(request)) return;
        setTiming((t) => ({ ...t, extractMs: performance.now() - started, confirmMs: undefined }));
        confirmClock.current = { kind: 'candidates', startedAt: performance.now() };
        setResult(r);
      },
      (e: unknown) => {
        setBusy(false);
        if (!requests.current.settle(request)) return;
        setError(failureCode(e));
      },
    );
  }, [image]);

  const { reset: resetSession } = session;
  const onEnd = useCallback(() => {
    requests.current.endSession();
    resetSession();
    setResult(undefined);
    setImage(undefined);
    setPreviewUrl(undefined);
    setError(undefined);
    if (fileInput.current !== null) fileInput.current.value = '';
    confirmClock.current = undefined;
    setEnded(true);
  }, [resetSession]);

  const extractEnabled = canExtract(ai) && image !== undefined && !busy;

  const ms = (v: number | undefined) => (v === undefined ? '-' : `${Math.round(v)} ms`);
  const title = boot.status === 'ready' ? boot.assets.pkg.formDef.title : FORM_TITLE;

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-primary">{COPY.appName}</h1>
            <p className="text-sm text-muted-foreground">{COPY.tagline}</p>
          </div>
          <Badge variant={boot.status === 'ready' ? 'success' : boot.status === 'failed' ? 'warning' : 'secondary'}>
            Form package: {boot.status}
          </Badge>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6">
        <Alert variant="info">
          <p>{COPY.intro(title)}</p>
          <p className="mt-2 text-xs">{COPY.privacyNote}</p>
        </Alert>

        <Card aria-labelledby="setup-heading">
          <CardHeader>
            <CardTitle id="setup-heading">{COPY.steps.form.title}</CardTitle>
            <CardDescription>{COPY.steps.form.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {COPY.boot.status}: <output data-testid="boot-status">{boot.status}</output>
            </p>
            {boot.status === 'failed' && (
              <Alert variant="destructive" role="alert">
                {COPY.boot.failed} (<code data-testid="boot-reason">{boot.reason}</code>). {COPY.boot.disabled}
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card aria-labelledby="ai-heading">
          <CardHeader>
            <CardTitle id="ai-heading">{COPY.steps.ai.title}</CardTitle>
            <CardDescription>{COPY.steps.ai.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{COPY.ai.availability}</dt>
              <dd>
                <output data-testid="availability">{availability}</output>
              </dd>
              <dt className="text-muted-foreground">{COPY.ai.status}</dt>
              <dd aria-live="polite">
                <output data-testid="ai-status">{ai.status}</output>
                {ai.reason !== undefined && (
                  <>
                    {' '}
                    ({COPY.ai.reason}: <output data-testid="ai-reason">{ai.reason}</output>)
                  </>
                )}
              </dd>
            </dl>
            {ai.status === 'preparing' && (
              <progress className="w-full" aria-label={COPY.ai.progress} max={1} value={ai.progress} />
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={onPrepare} disabled={ai.status !== 'not_started'}>
                {COPY.ai.prepare}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  dispatchAi({ type: 'skip' });
                }}
                disabled={ai.status === 'ready' || ai.status === 'skipped'}
              >
                {COPY.ai.skip}
              </Button>
            </div>
            {(ai.status === 'skipped' || ai.status === 'unavailable' || ai.status === 'failed') && (
              <Alert variant="warning" role="status">
                {COPY.ai.off}
              </Alert>
            )}
          </CardContent>
        </Card>

        {boot.status === 'ready' && (
          <>
            <Card aria-labelledby="image-heading">
              <CardHeader>
                <CardTitle id="image-heading">{COPY.steps.image.title}</CardTitle>
                <CardDescription>{COPY.steps.image.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {COPY.image.label}
                  <Input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(e) => {
                      setEnded(false);
                      onFile(e.currentTarget.files?.[0]);
                    }}
                  />
                </label>
                {previewUrl !== undefined && image !== undefined && (
                  <img
                    className="max-w-full rounded-md border"
                    src={previewUrl}
                    alt={COPY.image.alt}
                    width={Math.min(480, image.width)}
                  />
                )}
                <div>
                  <Button type="button" onClick={onExtract} disabled={!extractEnabled}>
                    {COPY.image.extract}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card aria-labelledby="result-heading">
              <CardHeader>
                <CardTitle id="result-heading">{COPY.steps.candidates.title}</CardTitle>
                <CardDescription>{COPY.steps.candidates.description}</CardDescription>
              </CardHeader>
              <CardContent aria-live="polite">
                {error !== undefined && (
                  <Alert variant="destructive" role="alert">
                    {COPY.candidates.failed}: <output data-testid="error">{error}</output>
                  </Alert>
                )}
                {busy && <p role="status">{COPY.candidates.extracting}</p>}
                {result !== undefined && (
                  <CandidatesPanel
                    result={result}
                    onApply={session.applyCandidate}
                  />
                )}
              </CardContent>
            </Card>

            <Card aria-labelledby="fields-heading">
              <CardHeader>
                <CardTitle id="fields-heading">{COPY.steps.fields.title}</CardTitle>
                <CardDescription>{COPY.steps.fields.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldsForm session={session} />
              </CardContent>
            </Card>

            <Card aria-labelledby="output-heading">
              <CardHeader>
                <CardTitle id="output-heading">{COPY.steps.output.title}</CardTitle>
                <CardDescription>{COPY.steps.output.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <OutputPanel assets={boot.assets} session={session} />
              </CardContent>
            </Card>

            <Card aria-labelledby="end-heading">
              <CardHeader>
                <CardTitle id="end-heading">{COPY.steps.end.title}</CardTitle>
                <CardDescription>{COPY.steps.end.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div>
                  <Button type="button" variant="destructive" onClick={onEnd}>
                    {COPY.end.button}
                  </Button>
                </div>
                {ended && (
                  <Alert variant="success" role="status">
                    <p>{COPY.end.cleared}</p>
                    <p className="mt-1">{COPY.end.limits}</p>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <details className="rounded-xl border bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium" id="diag-heading">
            {COPY.diagnostics}
          </summary>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground">
            <li>Firebase JS SDK: {FIREBASE_SDK_VERSION}</li>
            <li>Prompt version: {EXTRACTION_PROMPT_VERSION}</li>
            <li>Inference source required: on_device</li>
            <li>
              Prepare time: <output data-testid="prepare-ms">{ms(timing.prepareMs)}</output>
            </li>
            <li>
              Extract time: <output data-testid="extract-ms">{ms(timing.extractMs)}</output>
            </li>
            <li>
              Confirm time (candidates → all checked): <output data-testid="confirm-ms">{ms(timing.confirmMs)}</output>
            </li>
            <li>
              Manual entry time (first edit → all checked): <output data-testid="manual-ms">{ms(timing.manualMs)}</output>
            </li>
            <li>User agent: {navigator.userAgent}</li>
          </ul>
        </details>
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-muted-foreground">
        {boot.status === 'ready' && (
          <>
            <p>{boot.assets.pkg.formDef.credit}</p>
            <p data-testid="package-info">
              Form package {boot.assets.pkg.manifest.packageId} (FormDef revision {boot.assets.pkg.formDef.formDefRevision},
              signed by key {boot.assets.pkg.manifest.keyId}
              {boot.assets.pkg.testKey ? `, ${COPY.testKey}` : ''}).
            </p>
          </>
        )}
      </footer>
    </div>
  );
}
