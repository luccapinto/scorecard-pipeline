import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePolling } from './usePolling';

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('invokes the callback on each interval while visible', () => {
    const cb = vi.fn();
    renderHook(() => usePolling(cb, { intervalMs: 1000, isHidden: () => false }));
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it('does not fire while the tab is hidden', () => {
    const cb = vi.fn();
    renderHook(() => usePolling(cb, { intervalMs: 1000, isHidden: () => true }));
    vi.advanceTimersByTime(5000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('stops firing when disabled', () => {
    const cb = vi.fn();
    renderHook(() => usePolling(cb, { intervalMs: 1000, enabled: false, isHidden: () => false }));
    vi.advanceTimersByTime(5000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('does an immediate catch-up refresh when the tab becomes visible', () => {
    const cb = vi.fn();
    let hidden = true;
    renderHook(() => usePolling(cb, { intervalMs: 1000, isHidden: () => hidden }));

    // Hidden: interval is not even started.
    vi.advanceTimersByTime(2000);
    expect(cb).not.toHaveBeenCalled();

    // Become visible -> fires immediately, then resumes the interval.
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it('clears the interval on unmount', () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() =>
      usePolling(cb, { intervalMs: 1000, isHidden: () => false }),
    );
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
    unmount();
    vi.advanceTimersByTime(5000);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
