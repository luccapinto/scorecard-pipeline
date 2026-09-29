// Demo mode entry point. `App.tsx` imports this lazily, so the whole demo —
// dataset, dialogues, BARS reference — is code-split out of the initial bundle
// and API-mode users never download a byte of it.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { DemoControls, SimulationLevel } from '../data/demoControls';
import { DemoControlsContext } from '../data/demoControls';
import { DataSourceProvider } from '../data/source';
import { runtimeInterviewId } from './dataset';
import { createDemoSource } from './demoSource';
import type { DemoAction } from './state';
import { demoNow, demoReducer, initialDemoState } from './state';

interface Props {
  /**
   * Clock anchor. Supplied from `?t=` for reproducible screenshots; otherwise
   * the page-load timestamp, so dates read as relative to now.
   */
  anchor: number;
  /**
   * Simulated interview the first render must already contain — set when the
   * page opens directly on a guided-tour step that talks about it. Applied in
   * the reducer initialiser, so the state is still (anchor, actions) → screen
   * and no view ever renders a "not found" for the interview before it exists.
   */
  prepare?: SimulationLevel;
  children: React.ReactNode;
}

const PLAYABLE: Record<string, true> = {
  recebida: true,
  transcrevendo: true,
  diarizando: true,
  pontuando: true,
};

/** Time between two stages while a simulation plays. Long enough to read. */
const STEP_DELAY_MS = 1400;
const REDUCED_STEP_DELAY_MS = 350;

export function DemoProvider({ anchor, prepare, children }: Props) {
  const [state, dispatch] = useReducer(demoReducer, undefined, () => {
    const initial = initialDemoState(anchor);
    return prepare === undefined
      ? initial
      : demoReducer(initial, { type: 'prepareSimulation', level: prepare });
  });
  // The interview being walked through the pipeline, if any. Only a person's
  // click sets it (simulate, reprocess), so nothing moves on its own.
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Updated during render so a source created in an earlier render still
  // reads current state — see the comment on createDemoSource.
  const stateRef = useRef(state);
  stateRef.current = state;
  const getState = useCallback(() => stateRef.current, []);

  // Reprocessing resumes the pipeline in app/tasks.py, so the demo resumes it
  // too — otherwise a reprocessed interview would sit in TRANSCREVENDO forever.
  const sourceDispatch = useCallback((action: DemoAction) => {
    dispatch(action);
    if (action.type === 'reprocess') setPlayingId(action.id);
  }, []);

  // New object per state so effects keyed on the source re-run, while reads
  // go through the ref and are never stale.
  const source = useMemo(
    () => createDemoSource(getState, sourceDispatch),
    [getState, sourceDispatch, state],
  );

  const playingStatus =
    playingId === null
      ? undefined
      : state.interviews.find((interview) => interview.id === playingId)?.status;

  useEffect(() => {
    if (playingId === null) return;
    if (playingStatus === undefined || PLAYABLE[playingStatus] !== true) {
      // Reached review, failed, or vanished in a reset: the walk is over.
      setPlayingId(null);
      return;
    }
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(
      () => {
        const move = () => dispatch({ type: 'step', id: playingId });
        // A view transition lets the card glide between columns instead of
        // blinking from one to the next. Progressive: without the API, or
        // with reduced motion, the step simply happens.
        if (!reduced && typeof document.startViewTransition === 'function') {
          document.startViewTransition(() => flushSync(move));
        } else {
          move();
        }
      },
      reduced ? REDUCED_STEP_DELAY_MS : STEP_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playingId, playingStatus]);

  const controls = useMemo<DemoControls>(
    () => ({
      now: demoNow(state),
      reset: () => {
        setPlayingId(null);
        dispatch({ type: 'reset' });
      },
      lastIngestion: state.lastIngestion,
      simulatedId: state.simulatedId,
      playingId,
      simulate: () => {
        const id = runtimeInterviewId(stateRef.current.runtimeSequence + 1);
        dispatch({ type: 'simulate' });
        setPlayingId(id);
        return id;
      },
      prepare: (level: SimulationLevel) => {
        const current = stateRef.current;
        const id = current.simulatedId ?? runtimeInterviewId(current.runtimeSequence + 1);
        setPlayingId(null);
        dispatch({ type: 'prepareSimulation', level });
        return id;
      },
    }),
    [state, playingId],
  );

  return (
    <DataSourceProvider value={source}>
      <DemoControlsContext.Provider value={controls}>{children}</DemoControlsContext.Provider>
    </DataSourceProvider>
  );
}
