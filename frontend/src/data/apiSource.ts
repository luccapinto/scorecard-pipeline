// The real source: a thin adapter over `api/client`.
//
// This is the ONLY module in the app allowed to import `api/client`. That rule
// is enforced by `data/isolation.test.ts`, and it is what makes the demo's
// zero-network guarantee checkable rather than aspirational.

import {
  createInterview,
  decideInterview,
  getHealth,
  getIntegrations,
  getInterview,
  listInterviews,
  listJobs,
  listRecordings,
  reprocessInterview,
} from '../api/client';
import type { ApiConfig } from '../config/settings';
import { NotFoundError } from '../api/errors';
import type {
  ActionResponse,
  CreateInterviewPayload,
  CreateInterviewResponse,
  DecisionAction,
  Health,
  IntegrationsStatus,
  Interview,
  Job,
  Recording,
} from '../api/types';
import type { Capabilities, DataSource } from './source';

// Everything the real backend cannot answer is false here. Screens read these
// flags and render the matching sentence from API_GAPS instead of inventing a
// value. Changing one of these to `true` without adding the corresponding
// endpoint would be the exact failure this design exists to prevent.
const API_CAPABILITIES: Capabilities = {
  barsLevels: false,
  deliveryHistory: false,
  auditTrail: false,
  funnelStages: false,
  simulateIngestion: true,
  steppableClock: false,
};

/**
 * `configEpoch` increments whenever the user saves a new API config. It is
 * what tells consumers "this is a different dataset now" WITHOUT putting the
 * base URL or the API key into a string that travels around the app.
 */
export function createApiSource(config: ApiConfig, configEpoch: number): DataSource {
  return {
    mode: 'api',
    capabilities: API_CAPABILITIES,
    datasetKey: `api:${configEpoch}`,
    // The API source never mutates under us on its own; polling refreshes it.
    revision: 0,

    now(): number {
      return Date.now();
    },

    listInterviews(): Promise<Interview[]> {
      return listInterviews(config);
    },

    getInterview(id: string): Promise<Interview> {
      return getInterview(config, id);
    },

    listJobs(): Promise<Job[]> {
      return listJobs(config);
    },

    listRecordings(): Promise<Recording[]> {
      return listRecordings(config);
    },

    createInterview(payload: CreateInterviewPayload): Promise<CreateInterviewResponse> {
      return createInterview(config, payload);
    },

    decide(id: string, action: DecisionAction): Promise<ActionResponse> {
      return decideInterview(config, id, action);
    },

    async reprocess(id: string): Promise<void> {
      await reprocessInterview(config, id);
    },

    getHealth(): Promise<Health> {
      return getHealth(config);
    },

    async getIntegrations(): Promise<IntegrationsStatus | null> {
      try {
        return await getIntegrations(config);
      } catch (error) {
        // A deployment running a backend from before GET /integrations existed
        // answers 404. That is a missing feature, not a broken screen: report
        // "not exposed" and let the view explain. Every other error (auth,
        // offline) is a real failure and must still surface.
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },
  };
}
