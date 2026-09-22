// Registers the jest-dom matchers (toBeInTheDocument, toHaveTextContent, ...)
// and clears the DOM between tests.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// jsdom implements neither matchMedia nor scrollIntoView. Both are used by
// production code paths under test (theme resolution, quote -> transcript
// scrolling), so they are stubbed once here rather than in every suite.
if (typeof window !== 'undefined') {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => {};
  }
}

beforeEach(() => {
  // Config and preferences live in localStorage; leaking them between tests
  // would make suites order-dependent.
  localStorage.clear();
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
