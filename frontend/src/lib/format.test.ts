import { describe, expect, it } from 'vitest';

import { formatDateTime, formatRelative, parseTimestamp } from './format';

describe('parseTimestamp', () => {
  it('treats a timezone-less backend timestamp as UTC (not Invalid Date)', () => {
    // Real backend shape: no "Z", microsecond precision.
    const date = parseTimestamp('2026-07-21T23:39:10.380628');
    expect(Number.isNaN(date.getTime())).toBe(false);
    expect(date.toISOString()).toBe('2026-07-21T23:39:10.380Z');
  });

  it('respects an explicit timezone designator', () => {
    const date = parseTimestamp('2026-07-21T23:39:10Z');
    expect(date.toISOString()).toBe('2026-07-21T23:39:10.000Z');
  });
});

describe('formatDateTime / formatRelative never show "Invalid Date"', () => {
  it('formats a timezone-less timestamp without error', () => {
    const out = formatDateTime('2026-07-21T23:39:10.380628');
    expect(out).not.toMatch(/invalid/i);
    expect(out).not.toBe('—');
  });

  it('computes a relative age from a UTC-normalized timestamp', () => {
    const now = Date.parse('2026-07-21T23:44:10Z'); // 5 min later
    expect(formatRelative('2026-07-21T23:39:10.380628', now)).toBe('há 5 min');
  });

  it('falls back to the raw string on genuinely unparseable input', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
  });

  it('renders an em dash for empty input', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatRelative(undefined)).toBe('—');
  });
});
