import type { ExtractionResult } from '@formtwin/contracts';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
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

/**
 * Spike A screen. Measures on-device preparation and extraction separately.
 * Personal data stays in component state only: never logged, never put in URLs.
 */
const llm = new FirebaseOnDeviceLLM();

interface Timing {
  readonly prepareMs?: number;
  readonly extractMs?: number;
}

function failureCode(e: unknown): string {
  if (e instanceof OnDeviceError) return e.code;
  if (e instanceof ImageRejectedError) return `image_${e.reason}`;
  if (e instanceof Error && e.message === 'firebase-config-missing') return 'config_missing';
  return 'unknown';
}

export function App() {
  const [ai, dispatch] = useReducer(aiReducer, initialAiState);
  const [availability, setAvailability] = useState<DeviceAvailability | 'checking'>('checking');
  const [image, setImage] = useState<PreparedImage | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [result, setResult] = useState<ExtractionResult | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [timing, setTiming] = useState<Timing>({});
  const extractGeneration = useRef(0);

  useEffect(() => {
    let live = true;
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
    dispatch({ type: 'start' });
    const started = performance.now();
    llm
      .prepare((fraction) => {
        dispatch({ type: 'progress', attempt, fraction });
      })
      .then(
        () => {
          setTiming((t) => ({ ...t, prepareMs: performance.now() - started }));
          dispatch({ type: 'succeeded', attempt });
        },
        (e: unknown) => {
          const code = failureCode(e);
          dispatch(
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

  const extractEnabled = canExtract(ai) && image !== undefined && !busy;

  return (
    <main>
      <h1>FormTwin</h1>
      <p>Spike A: on-device extraction test. Use fictional sample images only.</p>

      <section aria-labelledby="ai-heading">
        <h2 id="ai-heading">1. Prepare on-device AI</h2>
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
            dispatch({ type: 'skip' });
          }}
          disabled={ai.status === 'ready' || ai.status === 'skipped'}
        >
          Continue without AI
        </button>
        {(ai.status === 'skipped' || ai.status === 'unavailable' || ai.status === 'failed') && (
          <p role="status">AI extraction is off for this session. You can enter values manually.</p>
        )}
      </section>

      <section aria-labelledby="image-heading">
        <h2 id="image-heading">2. Choose a sample image</h2>
        <label>
          Residence card image (JPEG or PNG){' '}
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => {
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
        <h2 id="result-heading">3. Result</h2>
        {error !== undefined && (
          <p role="alert">
            Failed: <output data-testid="error">{error}</output>
          </p>
        )}
        {busy && <p role="status">Extracting…</p>}
        {result !== undefined && (
          <>
            <p role="status">Candidates are not confirmed. Check every value against the image.</p>
            <dl data-testid="result">
              {result.fields.map((f) => (
                <div key={f.key}>
                  <dt>{f.key}</dt>
                  <dd>{f.value ?? '(not read)'}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>

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
    </main>
  );
}
