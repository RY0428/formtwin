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
  | { type: 'skip' };

export const initialAiState: AiState = { status: 'not_started', attempt: 0, progress: 0 };

export function aiReducer(state: AiState, event: AiEvent): AiState {
  switch (event.type) {
    case 'start':
      if (state.status !== 'not_started') return state;
      return { status: 'preparing', attempt: state.attempt + 1, progress: 0 };
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
