/**
 * Session lock and end rules (architecture.md §9.1; values fixed in docs/decisions.md 2026-11-13).
 * Pure functions over real timestamps (Date.now), so a timer that was paused while the tab was hidden
 * cannot extend the session: every check compares against the wall clock.
 */
export const INACTIVITY_MS = 10 * 60 * 1000;
export const WARNING_MS = 60 * 1000;

export type LifecycleStatus = 'active' | 'locked';

export interface Lifecycle {
  readonly status: LifecycleStatus;
  readonly lastActivityAt: number;
}

export type LifecycleCheck = 'ok' | 'warn' | 'expired';

export function startLifecycle(now: number): Lifecycle {
  return { status: 'active', lastActivityAt: now };
}

/** User input while active. Input never resumes a locked session by itself. */
export function recordActivity(l: Lifecycle, now: number): Lifecycle {
  return l.status === 'active' ? { ...l, lastActivityAt: now } : l;
}

export function check(l: Lifecycle, now: number): LifecycleCheck {
  const idle = now - l.lastActivityAt;
  if (idle >= INACTIVITY_MS) return 'expired';
  if (idle >= INACTIVITY_MS - WARNING_MS) return 'warn';
  return 'ok';
}

/** The page became hidden: lock at once (the inactivity deadline keeps running on real time). */
export function lock(l: Lifecycle): Lifecycle {
  return { ...l, status: 'locked' };
}

/** Explicit resume. Refused (returns null) when the deadline has passed in the meantime. */
export function resume(l: Lifecycle, now: number): Lifecycle | null {
  if (check(l, now) === 'expired') return null;
  return { status: 'active', lastActivityAt: now };
}
