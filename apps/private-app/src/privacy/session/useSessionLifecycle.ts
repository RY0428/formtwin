import { useCallback, useEffect, useRef, useState } from 'react';
import { check, lock, recordActivity, resume as resumeLifecycle, startLifecycle, type Lifecycle } from './lifecycle.ts';

export type EndReason = 'user' | 'inactivity' | 'restored' | 'expired_while_locked' | 'source_mismatch';

interface Options {
  /** Clears all session state. Called once per end. */
  readonly onEnd: (reason: EndReason) => void;
}

/**
 * Wires the lifecycle to the page (architecture.md §9.1):
 * - activity = keyboard, pointer or input events;
 * - `visibilitychange` → hidden locks at once; focus loss alone (e.g. a save dialog) does not;
 * - a 1 s tick compares with the wall clock (warn 1 min before, end at 10 min);
 * - `pagehide` → best-effort end; `pageshow` from the back/forward cache → end, so a restored page
 *   starts a new session instead of showing old values.
 */
export function useSessionLifecycle({ onEnd }: Options) {
  const life = useRef<Lifecycle>(startLifecycle(Date.now()));
  const [locked, setLocked] = useState(false);
  const [warning, setWarning] = useState(false);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  const restart = useCallback(() => {
    life.current = startLifecycle(Date.now());
    setLocked(false);
    setWarning(false);
  }, []);

  const end = useCallback(
    (reason: EndReason) => {
      endRef.current(reason);
      restart();
    },
    [restart],
  );

  useEffect(() => {
    const onActivity = () => {
      // The warning clears on the next tick, not here: removing it on pointerdown would pull the
      // "Keep working" button out from under the click.
      life.current = recordActivity(life.current, Date.now());
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        life.current = lock(life.current);
        setLocked(true);
      } else if (check(life.current, Date.now()) === 'expired') {
        end('expired_while_locked');
      }
    };
    const onPageHide = () => {
      end('user');
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) end('restored');
    };
    const tick = window.setInterval(() => {
      const c = check(life.current, Date.now());
      if (c === 'expired') end(life.current.status === 'locked' ? 'expired_while_locked' : 'inactivity');
      else setWarning(c === 'warn' && life.current.status === 'active');
    }, 1000);
    const opts = { capture: true, passive: true } as const;
    for (const t of ['keydown', 'pointerdown', 'input'] as const) window.addEventListener(t, onActivity, opts);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.clearInterval(tick);
      for (const t of ['keydown', 'pointerdown', 'input'] as const) window.removeEventListener(t, onActivity, opts);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [end]);

  const resume = useCallback(() => {
    const next = resumeLifecycle(life.current, Date.now());
    if (next === null) {
      end('expired_while_locked');
      return;
    }
    life.current = next;
    setLocked(false);
    setWarning(false);
  }, [end]);

  return { locked, warning, resume, end };
}
