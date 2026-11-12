import type { ExtractionResult } from '@formtwin/contracts';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { FORM_SOURCE, prepareFixedAssets, type FixedAssets } from '../bootstrap/fixedAssets.ts';
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
import { initialSession, sessionReducer } from '../pii/session/sessionState.ts';
import { CandidatesPanel } from './CandidatesPanel.tsx';
import { FieldsForm } from './FieldsForm.tsx';
import { OutputPanel } from './OutputPanel.tsx';

/**
 * Applicant screen (S5 working flow). Personal data lives in React state only:
 * never logged, never put in URLs or storage.
 */
const llm = new FirebaseOnDeviceLLM();

interface Timing {
  readonly prepareMs?: number;
  readonly extractMs?: number;
}

type Bootstrap = { status: 'preparing' } | { status: 'ready'; assets: FixedAssets } | { status: 'failed' };

function failureCode(e: unknown): string {
  if (e instanceof OnDeviceError) return e.code;
  if (e instanceof ImageRejectedError) return `image_${e.reason}`;
  if (e instanceof Error && e.message === 'firebase-config-missing') return 'config_missing';
  return 'unknown';
}

export function App() {
  const [boot, setBoot] = useState<Bootstrap>({ status: 'preparing' });
  const [ai, dispatchAi] = useReducer(aiReducer, initialAiState);
  const [session, dispatch] = useReducer(sessionReducer, undefined, initialSession);
  const [availability, setAvailability] = useState<DeviceAvailability | 'checking'>('checking');
  const [image, setImage] = useState<PreparedImage | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [result, setResult] = useState<ExtractionResult | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [timing, setTiming] = useState<Timing>({});
  const [ended, setEnded] = useState(false);
  const extractGeneration = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    prepareFixedAssets().then(
      (assets) => {
        if (live) setBoot({ status: 'ready', assets });
      },
      () => {
        if (live) setBoot({ status: 'failed' });
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
    extractGeneration.current += 1;
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
    const generation = ++extractGeneration.current;
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    const started = performance.now();
    llm.extract(image).then(
      (r) => {
        if (generation !== extractGeneration.current) return;
        setTiming((t) => ({ ...t, extractMs: performance.now() - started }));
        setResult(r);
        setBusy(false);
      },
      (e: unknown) => {
        if (generation !== extractGeneration.current) return;
        setError(failureCode(e));
        setBusy(false);
      },
    );
  }, [image]);

  const onEnd = useCallback(() => {
    extractGeneration.current += 1;
    dispatch({ type: 'reset' });
    setResult(undefined);
    setImage(undefined);
    setPreviewUrl(undefined);
    setError(undefined);
    setBusy(false);
    if (fileInput.current !== null) fileInput.current.value = '';
    setEnded(true);
  }, []);

  const extractEnabled = canExtract(ai) && image !== undefined && !busy;

  return (
    <main>
      <h1>FormTwin</h1>
      <p>
        Fill in the {FORM_SOURCE.title} on this device. Use fictional sample data only. This app supports checking
        your own entries; it does not judge eligibility or give legal advice.
      </p>

      <section aria-labelledby="setup-heading">
        <h2 id="setup-heading">0. Form and font</h2>
        <p>
          Form status: <output data-testid="boot-status">{boot.status}</output>
        </p>
        {boot.status === 'failed' && (
          <p role="alert">The bundled form could not be verified. Entry is disabled.</p>
        )}
      </section>

      <section aria-labelledby="ai-heading">
        <h2 id="ai-heading">1. Prepare on-device AI (optional)</h2>
        <p>
          Browser AI availability: <output data-testid="availability">{availability}</output>
        </p>
        <p>
          AI status: <output data-testid="ai-status">{ai.status}</output>
          {ai.reason !== undefined && (
            <>
              {' '}
              (reason: <output data-testid="ai-reason">{ai.reason}</output>)
            </>
          )}
        </p>
        {ai.status === 'preparing' && (
          <progress aria-label="Model download progress" max={1} value={ai.progress} />
        )}
        <button type="button" onClick={onPrepare} disabled={ai.status !== 'not_started'}>
          Prepare AI
        </button>{' '}
        <button
          type="button"
          onClick={() => {
            dispatchAi({ type: 'skip' });
          }}
          disabled={ai.status === 'ready' || ai.status === 'skipped'}
        >
          Continue without AI
        </button>
        {(ai.status === 'skipped' || ai.status === 'unavailable' || ai.status === 'failed') && (
          <p role="status">AI extraction is off for this session. You can enter values manually.</p>
        )}
      </section>

      {boot.status === 'ready' && (
        <>
          <section aria-labelledby="image-heading">
            <h2 id="image-heading">2. Choose a sample image (optional)</h2>
            <label>
              Residence card image (JPEG or PNG){' '}
              <input
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
              <p>
                <img src={previewUrl} alt="Selected sample" width={Math.min(480, image.width)} />
              </p>
            )}
            <button type="button" onClick={onExtract} disabled={!extractEnabled}>
              Extract on this device
            </button>
          </section>

          <section aria-labelledby="result-heading">
            <h2 id="result-heading">3. Candidates</h2>
            {error !== undefined && (
              <p role="alert">
                Failed: <output data-testid="error">{error}</output>
              </p>
            )}
            {busy && <p role="status">Extracting…</p>}
            {result !== undefined && (
              <CandidatesPanel
                result={result}
                onApply={(values) => {
                  dispatch({ type: 'applyCandidate', values });
                }}
              />
            )}
          </section>

          <section aria-labelledby="fields-heading">
            <h2 id="fields-heading">4. Check every value</h2>
            <FieldsForm
              state={session}
              dispatch={(e) => {
                setEnded(false);
                dispatch(e);
              }}
            />
          </section>

          <section aria-labelledby="output-heading">
            <h2 id="output-heading">5. Create and save the PDF</h2>
            <OutputPanel assets={boot.assets} state={session} />
          </section>

          <section aria-labelledby="end-heading">
            <h2 id="end-heading">6. Finish</h2>
            <button type="button" onClick={onEnd}>
              End session and clear data
            </button>
            {ended && (
              <p role="status">
                Your inputs, images, and generated results have been cleared from this app. Your original files and
                downloaded PDFs have not been deleted. This app cannot guarantee deletion of browser or operating-system
                history, memory, synced files, or backups.
              </p>
            )}
          </section>
        </>
      )}

      <section aria-labelledby="diag-heading">
        <h2 id="diag-heading">Diagnostics (no personal data)</h2>
        <ul>
          <li>Firebase JS SDK: {FIREBASE_SDK_VERSION}</li>
          <li>Prompt version: {EXTRACTION_PROMPT_VERSION}</li>
          <li>Inference source required: on_device</li>
          <li>
            Prepare time:{' '}
            <output data-testid="prepare-ms">
              {timing.prepareMs === undefined ? '-' : `${Math.round(timing.prepareMs)} ms`}
            </output>
          </li>
          <li>
            Extract time:{' '}
            <output data-testid="extract-ms">
              {timing.extractMs === undefined ? '-' : `${Math.round(timing.extractMs)} ms`}
            </output>
          </li>
          <li>User agent: {navigator.userAgent}</li>
        </ul>
      </section>

      <footer>
        <p>{FORM_SOURCE.credit}</p>
      </footer>
    </main>
  );
}
