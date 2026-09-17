import { useEffect, useRef } from 'react';

export interface UsePollingOptions {
  intervalMs: number;
  enabled?: boolean;
  // When true, polling pauses while the tab is hidden and fires an immediate
  // refresh when it becomes visible again. Defaults to true.
  pauseWhenHidden?: boolean;
  // Injectable for tests; defaults to the real document visibility state.
  isHidden?: () => boolean;
}

// Calls `callback` every intervalMs while enabled and (optionally) the tab is
// visible. The callback ref is kept fresh so the interval never captures a
// stale closure. Pure timer/visibility wiring — the data fetching lives in the
// caller.
export function usePolling(callback: () => void, options: UsePollingOptions): void {
  const {
    intervalMs,
    enabled = true,
    pauseWhenHidden = true,
    isHidden = () => typeof document !== 'undefined' && document.hidden,
  } = options;

  const savedCallback = useRef(callback);
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (pauseWhenHidden && isHidden()) return;
      savedCallback.current();
    };

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (!pauseWhenHidden) return;
      if (isHidden()) {
        stop();
      } else {
        // Immediate catch-up refresh, then resume the interval.
        savedCallback.current();
        start();
      }
    };

    if (!(pauseWhenHidden && isHidden())) {
      start();
    }

    if (pauseWhenHidden && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      stop();
      if (pauseWhenHidden && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [enabled, intervalMs, pauseWhenHidden, isHidden]);
}
