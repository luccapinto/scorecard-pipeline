import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useHashRoute } from './useHashRoute';

describe('useHashRoute scroll position', () => {
  it('opens a different page at its top, and keeps it inside the same page', async () => {
    window.location.hash = '#/demo/entrevistas/demo-bruno-exemplo';
    const scrollTo = vi.spyOn(window, 'scrollTo');
    const { result } = renderHook(() => useHashRoute());
    // The first page is whatever the browser restored: not ours to move.
    expect(scrollTo).not.toHaveBeenCalled();

    // Highlighting a citation stays on the scorecard the person is reading.
    act(() => {
      window.location.hash = '#/demo/entrevistas/demo-bruno-exemplo?citacao=2';
    });
    await waitFor(() => expect(result.current.quote).toBe(2));
    expect(scrollTo).not.toHaveBeenCalled();

    // Another page must not inherit the scorecard's offset: "Por dentro"
    // clicked from the bottom of a scorecard opened with its heading far
    // above the viewport.
    act(() => {
      window.location.hash = '#/demo/por-dentro';
    });
    await waitFor(() => expect(result.current.name).toBe('inside'));
    // Instantly: gliding up from the old offset is the same bug, animated.
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });
});
