import { describe, expect, it } from 'vitest';
import { INACTIVITY_MS, WARNING_MS, check, lock, recordActivity, resume, startLifecycle } from './lifecycle.ts';

describe('session lifecycle (10 min, warning 1 min before)', () => {
  const t0 = 1_000_000;
  it('warns one minute before and expires at the limit', () => {
    const l = startLifecycle(t0);
    expect(check(l, t0 + INACTIVITY_MS - WARNING_MS - 1)).toBe('ok');
    expect(check(l, t0 + INACTIVITY_MS - WARNING_MS)).toBe('warn');
    expect(check(l, t0 + INACTIVITY_MS)).toBe('expired');
  });
  it('activity extends only while active', () => {
    const l = recordActivity(startLifecycle(t0), t0 + 5000);
    expect(l.lastActivityAt).toBe(t0 + 5000);
    const locked = lock(l);
    expect(recordActivity(locked, t0 + 9000)).toBe(locked);
  });
  it('resume needs an explicit call and is refused after the real-time deadline', () => {
    const locked = lock(startLifecycle(t0));
    expect(resume(locked, t0 + 1000)).toEqual({ status: 'active', lastActivityAt: t0 + 1000 });
    expect(resume(locked, t0 + INACTIVITY_MS)).toBeNull();
  });
});
