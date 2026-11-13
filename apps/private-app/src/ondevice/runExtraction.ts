import type { ExtractionResult } from '@formtwin/contracts';
import { OnDeviceError } from './OnDeviceLLM.ts';

/** docs/decisions.md: 30 s per attempt; at most 1 automatic retry, only for invalid output. */
export const EXTRACTION_TIMEOUT_MS = 30_000;
export const MAX_ATTEMPTS = 2;

type SetTimer = (fn: () => void, ms: number) => () => void;

const defaultTimer: SetTimer = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => {
    clearTimeout(id);
  };
};

export interface ExtractionRun {
  /** The accepted result, or the final failure (OnDeviceError `timeout`, `invalid_output`, …). */
  readonly result: Promise<ExtractionResult>;
  /**
   * Resolves once no device call from this run is still running. The on-device call cannot be
   * aborted with SDK 13.3.0, so after a time-out the caller waits for this before starting another
   * request (architecture.md §6.2-4: no stacking requests on an unfinished one).
   */
  readonly idle: Promise<void>;
  /** Number of device calls made (1 or 2). */
  readonly attempts: () => number;
}

/**
 * Runs one extraction with the time limit and the retry rule (architecture.md §6.2-3〜5).
 * - Each attempt races the device call against the limit; on expiry the result is `timeout` and the
 *   late answer is dropped. A time-out is never retried.
 * - `invalid_output` (the call finished with unusable output) is retried once. Nothing else is.
 * - There is no cloud path here: retries go to the same on-device adapter.
 */
export function runExtraction(
  extract: () => Promise<ExtractionResult>,
  opts: { timeoutMs?: number; setTimer?: SetTimer } = {},
): ExtractionRun {
  const timeoutMs = opts.timeoutMs ?? EXTRACTION_TIMEOUT_MS;
  const setTimer = opts.setTimer ?? defaultTimer;
  let attempts = 0;
  let inFlight: Promise<unknown> = Promise.resolve();

  const attempt = async (): Promise<ExtractionResult> => {
    attempts += 1;
    const call = extract();
    inFlight = call.catch(() => undefined);
    let cancel: () => void = () => undefined;
    const limit = new Promise<never>((_, reject) => {
      cancel = setTimer(() => {
        reject(new OnDeviceError('timeout'));
      }, timeoutMs);
    });
    try {
      return await Promise.race([call, limit]);
    } catch (e) {
      if (e instanceof OnDeviceError && e.code === 'invalid_output' && attempts < MAX_ATTEMPTS) return attempt();
      throw e;
    } finally {
      cancel();
    }
  };

  const result = attempt();
  const idle = result.then(
    () => undefined,
    () => undefined,
  ).then(() => inFlight).then(() => undefined);
  return { result, idle, attempts: () => attempts };
}
