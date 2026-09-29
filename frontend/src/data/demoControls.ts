// Demo controls as a CONTRACT, declared outside the demo module.
//
// Screens shared by both modes (the pipeline board, the ingestion inspector,
// the guided tour) need to read demo state when it exists. If they imported
// the demo module to do that, the dependency direction would invert: the demo
// could no longer be code-split out, and deleting it would break API mode.
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

/**
 * How far along a simulated interview must be. The guided tour asks for a
 * level before showing a step, so any step can be opened directly by URL and
 * still find the interview it talks about — built instantly and purely, never
 * by waiting on an animation.
 */
export type SimulationLevel = 'created' | 'midway' | 'processed';

export interface DemoControls {
  /** The demo's anchored clock in epoch ms. Never wall time. */
  now: number;
  reset: () => void;
  lastIngestion: IngestionRecord | null;
  /** Id of the latest interview created by `simulate`, if any. */
  simulatedId: string | null;
  /** Interview the demo is walking through the pipeline right now, if any. */
  playingId: string | null;
  /**
   * "Simular nova entrevista": a synthetic recording arrives through the
   * webhook and is walked through every stage, one step at a time. Returns
   * the new interview's id. Nothing moves until a person asks for it.
   */
  simulate: () => string;
  /** Brings the simulated interview to at least `level` instantly; returns its id. */
  prepare: (level: SimulationLevel) => string;
}

export const DemoControlsContext = createContext<DemoControls | null>(null);

/** `null` outside demo mode, so callers can branch without a capability flag. */
export function useDemoControls(): DemoControls | null {
  return useContext(DemoControlsContext);
}
