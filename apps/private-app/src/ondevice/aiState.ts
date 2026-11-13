/**
 * AI readiness, managed separately from the session (architecture.md §9.1).
 * Extraction is allowed only in `ready`. Once the session committed to manual
 * entry (`skipped`, or any failure), a late completion never switches it back.
 */
export type AiStatus = 'not_started' | 'preparing' | 'ready' | 'unavailable' | 'failed' | 'skipped';

export interface AiState {
  readonly status: AiStatus;
  /** Increments on every start; completions from older attempts are ignored. */
  readonly attempt: number;
  readonly progress: number;
  readonly reason?: string;
}

export type AiEvent =
  | { type: 'start' }
  | { type: 'progress'; attempt: number; fraction: number }
  | { type: 'succeeded'; attempt: number }
  | { type: 'unavailable'; attempt: number; reason: string }
  | { type: 'failed'; attempt: number; reason: string }
  | { type: 'skip' }
  | { type: 'cancel' }
  | { type: 'newSession' };

export const initialAiState: AiState = { status: 'not_started', attempt: 0, progress: 0 };

export function aiReducer(state: AiState, event: AiEvent): AiState {
  switch (event.type) {
    // A new session keeps what is true of the device (ready, unavailable, a download in progress) and
    // forgets the previous session's choice (skipped) or failure, so AI can be prepared again
    // (requirements.md MVP 7). The attempt counter is kept, so late completions stay ignored.
    case 'newSession':
      if (state.status !== 'skipped' && state.status !== 'failed') return state;
      return { status: 'not_started', attempt: state.attempt, progress: 0 };
    case 'start':
      if (state.status !== 'not_started') return state;
      return { status: 'preparing', attempt: state.attempt + 1, progress: 0 };
    // Cancelling preparation: the browser may keep downloading, but this app stops waiting and a late
    // completion (same attempt, no longer `preparing`) is ignored (architecture.md §6.2-2).
    case 'cancel':
      if (state.status !== 'preparing') return state;
      return { status: 'failed', attempt: state.attempt, progress: state.progress, reason: 'cancelled' };
    case 'skip':
      if (state.status === 'ready') return state;
      return { status: 'skipped', attempt: state.attempt, progress: state.progress };
    case 'progress':
      if (state.status !== 'preparing' || event.attempt !== state.attempt) return state;
      return { ...state, progress: Math.min(1, Math.max(0, event.fraction)) };
    case 'succeeded':
      if (state.status !== 'preparing' || event.attempt !== state.attempt) return state;
      return { status: 'ready', attempt: state.attempt, progress: 1 };
    case 'unavailable':
      if (state.status !== 'preparing' || event.attempt !== state.attempt) return state;
      return { status: 'unavailable', attempt: state.attempt, progress: state.progress, reason: event.reason };
    case 'failed':
      if (state.status !== 'preparing' || event.attempt !== state.attempt) return state;
      return { status: 'failed', attempt: state.attempt, progress: state.progress, reason: event.reason };
  }
}

export const canExtract = (state: AiState): boolean => state.status === 'ready';
