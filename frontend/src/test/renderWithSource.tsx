// Test harness: renders a component inside a stub DataSource.
//
// Components read data through `useDataSource()`, so a unit test has to supply
// one. The stub defaults to API-mode capabilities (everything the real backend
// cannot answer is false), which keeps tests honest by default: a screen that
// accidentally depends on a demo-only capability fails here.

import { render, type RenderResult } from '@testing-library/react';
import { vi } from 'vitest';

import type { Health, Interview } from '../api/types';
import { AnnouncerProvider } from '../components/ui/Announcer';
import type { Capabilities, DataSource } from '../data/source';
import { DataSourceProvider } from '../data/source';

const API_CAPABILITIES: Capabilities = {
  barsLevels: false,
  deliveryHistory: false,
  auditTrail: false,
  funnelStages: false,
  simulateIngestion: true,
  steppableClock: false,
};

/** Fixed instant so relative-time assertions never depend on wall clock. */
export const TEST_NOW = Date.parse('2026-07-21T12:30:00Z');

export function makeStubSource(overrides: Partial<DataSource> = {}): DataSource {
  const empty: Interview[] = [];
  const health: Health = { status: 'ok' };

  return {
    mode: 'api',
    capabilities: API_CAPABILITIES,
    datasetKey: 'test',
    revision: 0,
    now: () => TEST_NOW,
    listInterviews: vi.fn().mockResolvedValue(empty),
    getInterview: vi.fn().mockRejectedValue(new Error('not stubbed')),
    listJobs: vi.fn().mockResolvedValue([]),
    listRecordings: vi.fn().mockResolvedValue([]),
    createInterview: vi.fn().mockRejectedValue(new Error('not stubbed')),
    decide: vi.fn().mockRejectedValue(new Error('not stubbed')),
    reprocess: vi.fn().mockResolvedValue(undefined),
    getHealth: vi.fn().mockResolvedValue(health),
    getIntegrations: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

export function renderWithSource(
  ui: React.ReactNode,
  source: DataSource = makeStubSource(),
): RenderResult & { source: DataSource } {
  const result = render(
    <AnnouncerProvider>
      <DataSourceProvider value={source}>{ui}</DataSourceProvider>
    </AnnouncerProvider>,
  );
  return { ...result, source };
}
