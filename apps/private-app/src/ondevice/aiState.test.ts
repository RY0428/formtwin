import { describe, expect, it } from 'vitest';
import { aiReducer, canExtract, initialAiState, type AiEvent, type AiState } from './aiState.ts';

const run = (events: AiEvent[], from: AiState = initialAiState) => events.reduce(aiReducer, from);

describe('aiReducer', () => {
  it('reaches ready only through start → succeeded', () => {
    const s = run([{ type: 'start' }, { type: 'progress', attempt: 1, fraction: 0.5 }, { type: 'succeeded', attempt: 1 }]);
    expect(s.status).toBe('ready');
    expect(canExtract(s)).toBe(true);
  });

  it('ignores a late success after the user skipped AI', () => {
    const s = run([{ type: 'start' }, { type: 'skip' }, { type: 'succeeded', attempt: 1 }]);
    expect(s.status).toBe('skipped');
    expect(canExtract(s)).toBe(false);
  });

  it('does not restart preparation in the same session', () => {
    const failed = run([{ type: 'start' }, { type: 'failed', attempt: 1, reason: 'x' }]);
    expect(run([{ type: 'start' }, { type: 'succeeded', attempt: 2 }], failed).status).toBe('failed');
    const skipped = run([{ type: 'skip' }, { type: 'start' }]);
    expect(skipped.status).toBe('skipped');
  });

  it('ignores events from another attempt', () => {
    const s = run([{ type: 'start' }, { type: 'succeeded', attempt: 99 }]);
    expect(s.status).toBe('preparing');
  });

  it('allows skipping from any state except ready', () => {
    expect(run([{ type: 'start' }, { type: 'unavailable', attempt: 1, reason: 'x' }, { type: 'skip' }]).status).toBe('skipped');
    const ready = run([{ type: 'start' }, { type: 'succeeded', attempt: 1 }]);
    expect(aiReducer(ready, { type: 'skip' }).status).toBe('ready');
  });

  it('new session: resets skipped/failed, keeps device states, ignores late completions', () => {
    const skipped = aiReducer(initialAiState, { type: 'skip' });
    expect(aiReducer(skipped, { type: 'newSession' }).status).toBe('not_started');
    const preparing = aiReducer(initialAiState, { type: 'start' });
    const failed = aiReducer(preparing, { type: 'failed', attempt: 1, reason: 'x' });
    const fresh = aiReducer(failed, { type: 'newSession' });
    expect(fresh.status).toBe('not_started');
    expect(aiReducer(fresh, { type: 'succeeded', attempt: 1 }).status).toBe('not_started');
    const ready = aiReducer(preparing, { type: 'succeeded', attempt: 1 });
    expect(aiReducer(ready, { type: 'newSession' })).toBe(ready);
    expect(aiReducer(preparing, { type: 'newSession' })).toBe(preparing);
  });

  it('cancel: preparing → failed (cancelled); a late completion is ignored', () => {
    const preparing = aiReducer(initialAiState, { type: 'start' });
    const cancelled = aiReducer(preparing, { type: 'cancel' });
    expect(cancelled).toMatchObject({ status: 'failed', reason: 'cancelled' });
    expect(aiReducer(cancelled, { type: 'succeeded', attempt: 1 })).toBe(cancelled);
    expect(aiReducer(initialAiState, { type: 'cancel' })).toBe(initialAiState);
  });

  it('block: AI off for the page, kept across new sessions, late completion ignored', () => {
    const ready = aiReducer(aiReducer(initialAiState, { type: 'start' }), { type: 'succeeded', attempt: 1 });
    const blocked = aiReducer(ready, { type: 'block', reason: 'source_mismatch' });
    expect(blocked).toMatchObject({ status: 'unavailable', reason: 'source_mismatch' });
    expect(aiReducer(blocked, { type: 'newSession' })).toBe(blocked);
    expect(aiReducer(blocked, { type: 'start' })).toBe(blocked);
    expect(aiReducer(blocked, { type: 'succeeded', attempt: blocked.attempt })).toBe(blocked);
  });
});
