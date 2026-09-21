// Demo mode entry point. `App.tsx` imports this lazily, so the whole demo —
// dataset, dialogues, BARS reference — is code-split out of the initial bundle
// and API-mode users never download a byte of it.

import { useCallback, useMemo, useReducer, useRef } from 'react';

import type { DemoControls } from '../data/demoControls';
import { DemoControlsContext } from '../data/demoControls';
import { DataSourceProvider } from '../data/source';
import { createDemoSource } from './demoSource';
import { demoNow, demoReducer, initialDemoState } from './state';

interface Props {
  /**
   * Clock anchor. Supplied from `?t=` for reproducible screenshots; otherwise
   * the page-load timestamp, so dates read as relative to now.
   */
  anchor: number;
  children: React.ReactNode;
}

const ADVANCEABLE: Record<string, true> = {
  recebida: true,
  transcrevendo: true,
  diarizando: true,
  pontuando: true,
};

export function DemoProvider({ anchor, children }: Props) {
  const [state, dispatch] = useReducer(demoReducer, anchor, initialDemoState);

  // Updated during render so a source created in an earlier render still
  // reads current state — see the comment on createDemoSource.
  const stateRef = useRef(state);
  stateRef.current = state;
  const getState = useCallback(() => stateRef.current, []);

  // New object per state so effects keyed on the source re-run, while reads
  // go through the ref and are never stale.
  const source = useMemo(() => createDemoSource(getState, dispatch), [getState, state]);

  const controls = useMemo<DemoControls>(
    () => ({
      step: state.step,
      now: demoNow(state),
      advance: () => dispatch({ type: 'advance' }),
      reset: () => dispatch({ type: 'reset' }),
      hasPendingWork: state.interviews.some(
        (interview) => ADVANCEABLE[interview.status] === true,
      ),
      lastIngestion: state.lastIngestion,
    }),
    [state],
  );

  return (
    <DataSourceProvider value={source}>
      <DemoControlsContext.Provider value={controls}>{children}</DemoControlsContext.Provider>
    </DataSourceProvider>
  );
}
