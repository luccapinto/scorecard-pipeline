// Guided-tour state.
//
// The URL is the source of truth for "a tour step is on screen": `?tour=<n>`
// is set by the tour itself as it moves, so a step is a link like any other —
// the back button walks the tour backwards, a reload lands on the same step,
// and screenshots or the accessibility audit open a step directly.
//
// localStorage only remembers where to RESUME. Following an ordinary link out
// of the tour drops the parameter, which closes the overlay without losing
// the place; the header then offers "Retomar tour".

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { Route } from '../../app/routes';
import { useDemoControls } from '../../data/demoControls';
import { navigate } from '../../hooks/useHashRoute';
import { TOUR_STEPS } from './steps';
import { TourOverlay } from './TourOverlay';

const STORAGE_KEY = 'scorecard-pipeline.tour';

interface Stored {
  /** 0-based step last shown. */
  step: number;
  done: boolean;
}

function readStored(): Stored | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Stored> | null;
    if (parsed === null || typeof parsed.step !== 'number') return null;
    const step = Math.min(Math.max(0, Math.floor(parsed.step)), TOUR_STEPS.length - 1);
    return { step, done: parsed.done === true };
  } catch {
    return null;
  }
}

function writeStored(value: Stored): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export interface TourApi {
  /** 0-based step on screen, or `null` when no step is showing. */
  current: number | null;
  total: number;
  /** 0-based step a tour left mid-way would resume at, or `null`. */
  resumable: number | null;
  start: (index?: number) => void;
  next: () => void;
  previous: () => void;
  close: () => void;
}

const TourContext = createContext<TourApi | null>(null);

/** `null` outside demo mode: there is nothing to tour without the dataset. */
export function useTour(): TourApi | null {
  return useContext(TourContext);
}

interface Props {
  route: Route;
  children: React.ReactNode;
}

export function TourProvider({ route, children }: Props) {
  const controls = useDemoControls();
  const [stored, setStored] = useState<Stored | null>(readStored);

  const current =
    route.tour !== undefined && route.tour >= 1 && route.tour <= TOUR_STEPS.length
      ? route.tour - 1
      : null;

  const remember = useCallback((value: Stored) => {
    writeStored(value);
    setStored(value);
  }, []);

  useEffect(() => {
    if (current !== null) remember({ step: current, done: false });
  }, [current, remember]);

  const show = useCallback(
    (index: number, options: { prepare: boolean } = { prepare: true }) => {
      if (controls === null) return;
      const step = TOUR_STEPS[index];
      let simulatedId = controls.simulatedId ?? '';
      if (options.prepare && step.requires !== undefined) {
        simulatedId = controls.prepare(step.requires);
      }
      navigate({ ...step.route(simulatedId), clockAnchor: route.clockAnchor, tour: index + 1 });
    },
    [controls, route.clockAnchor],
  );

  // Step 2 asks the visitor to press the real "Simular" button. When they do,
  // the tour follows them to the next step instead of waiting for "Próximo".
  const playingAtEntry = useRef<string | null>(null);
  useEffect(() => {
    if (current === null || !TOUR_STEPS[current].startsSimulation) return;
    // Deliberately keyed on the step alone: the baseline is what was playing
    // when the step appeared, not whatever is playing on a later render.
    playingAtEntry.current = controls?.playingId ?? null;
  }, [current]);
  useEffect(() => {
    if (current === null || !TOUR_STEPS[current].startsSimulation) return;
    const playing = controls?.playingId ?? null;
    if (playing !== null && playing !== playingAtEntry.current) {
      show(current + 1, { prepare: false });
    }
  }, [current, controls?.playingId, show]);

  const api = useMemo<TourApi>(() => {
    const resumable =
      current === null && stored !== null && !stored.done && stored.step > 0 ? stored.step : null;
    return {
      current,
      total: TOUR_STEPS.length,
      resumable,
      start: (index = 0) => show(index),
      next: () => {
        if (current === null || controls === null) return;
        if (current === TOUR_STEPS.length - 1) {
          remember({ step: current, done: true });
          navigate({ ...route, tour: undefined });
          return;
        }
        if (TOUR_STEPS[current].startsSimulation) {
          // The visitor chose "Próximo" over the button: play it for them.
          if (controls.playingId === null) controls.simulate();
          show(current + 1, { prepare: false });
          return;
        }
        show(current + 1);
      },
      previous: () => {
        if (current !== null && current > 0) show(current - 1);
      },
      close: () => {
        if (current === null) return;
        remember({ step: current, done: current === TOUR_STEPS.length - 1 });
        navigate({ ...route, tour: undefined });
      },
    };
  }, [current, stored, show, controls, route, remember]);

  return (
    <TourContext.Provider value={api}>
      {children}
      {current !== null && <TourOverlay step={TOUR_STEPS[current]} index={current} api={api} />}
    </TourContext.Provider>
  );
}
