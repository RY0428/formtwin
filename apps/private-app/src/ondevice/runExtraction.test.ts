import type { ExtractionResult } from '@formtwin/contracts';
import { describe, expect, it } from 'vitest';
import { OnDeviceError } from './OnDeviceLLM.ts';
import { runExtraction } from './runExtraction.ts';

const ok = { fields: [] } as unknown as ExtractionResult;

/** Manual timer: fires only when `fire()` is called. */
function manualTimer() {
  const pending: (() => void)[] = [];
  return {
    setTimer: (fn: () => void) => {
      pending.push(fn);
      return () => {
        const i = pending.indexOf(fn);
        if (i >= 0) pending.splice(i, 1);
      };
    },
    fire: () => {
      for (const fn of pending.splice(0)) fn();
    },
    count: () => pending.length,
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof OnDeviceError ? e.code : 'other';
  }
};

describe('runExtraction', () => {
  it('returns the result and clears the timer', async () => {
    const t = manualTimer();
    const run = runExtraction(() => Promise.resolve(ok), t);
    expect(await run.result).toBe(ok);
    expect(t.count()).toBe(0);
    expect(run.attempts()).toBe(1);
  });

  it('times out, drops the late answer, never retries, and is idle only after the call finished', async () => {
    const t = manualTimer();
    const call = deferred<ExtractionResult>();
    const run = runExtraction(() => call.promise, t);
    let idle = false;
    void run.idle.then(() => (idle = true));
    t.fire();
    expect(await code(run.result)).toBe('timeout');
    await Promise.resolve();
    expect(idle).toBe(false);
    call.resolve(ok);
    await run.idle;
    expect(idle).toBe(true);
    expect(run.attempts()).toBe(1);
  });

  it('retries invalid output once and accepts the second answer', async () => {
    let n = 0;
    const run = runExtraction(() => {
      n += 1;
      return n === 1 ? Promise.reject(new OnDeviceError('invalid_output')) : Promise.resolve(ok);
    }, manualTimer());
    expect(await run.result).toBe(ok);
    expect(run.attempts()).toBe(2);
  });

  it('stops after the second invalid output', async () => {
    const run = runExtraction(() => Promise.reject(new OnDeviceError('invalid_output')), manualTimer());
    expect(await code(run.result)).toBe('invalid_output');
    expect(run.attempts()).toBe(2);
  });

  it.each(['inference_failed', 'source_mismatch', 'not_prepared', 'api_missing'] as const)('does not retry %s', async (c) => {
    const run = runExtraction(() => Promise.reject(new OnDeviceError(c)), manualTimer());
    expect(await code(run.result)).toBe(c);
    expect(run.attempts()).toBe(1);
  });
});
