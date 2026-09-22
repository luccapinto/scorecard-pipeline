// Demo controls as a CONTRACT, declared outside the demo module.
//
// Screens shared by both modes (the ingestion inspector, the demo toolbar)
// need to read demo state when it exists. If they imported the demo module to
// do that, the dependency direction would invert: the demo could no longer be
// code-split out, and deleting it would break API mode.
//
// So the context and its types live here, in `data/`, and only `demo/` ever
// provides a value. Outside demo mode the hook returns `null` and callers skip
// the section — see `data/isolation.test.ts`, which enforces the direction.

import { createContext, useContext } from 'react';

import type { CreateInterviewPayload, CreateInterviewResponse } from '../api/types';

export interface IngestionRecord {
  at: number;
  payload: CreateInterviewPayload;
  /** Always a placeholder: the browser cannot and must not sign the webhook. */
  signatureHeader: string;
  httpStatus: number;
  response: CreateInterviewResponse;
}

export interface DemoControls {
  /** Number of advance steps taken; part of the reproducibility contract. */
  step: number;
  /** The demo's anchored clock in epoch ms. Never wall time. */
  now: number;
  /** Moves every in-flight interview one stage forward. */
  advance: () => void;
  reset: () => void;
  /** True while at least one interview can still move on its own. */
  hasPendingWork: boolean;
  lastIngestion: IngestionRecord | null;
}

export const DemoControlsContext = createContext<DemoControls | null>(null);

/** `null` outside demo mode, so callers can branch without a capability flag. */
export function useDemoControls(): DemoControls | null {
  return useContext(DemoControlsContext);
}
