// One poll loop for the whole application.
//
// Four screens need the interview list (dashboard, list, approvals, funnel).
// Fetching per screen would mean four timers, four copies of a payload that
// already carries full transcripts, and four chances to show different numbers
// at the same instant. So the list is fetched once here, projected once, and
// shared.
//
// This is also where polled changes are ANNOUNCED. A status moving on its own
// is exactly the change a sighted user sees and a screen-reader user would
// otherwise never be told about.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { Interview } from '../api/types';
import { useAnnouncer } from '../components/ui/Announcer';
import { usePolling } from '../hooks/usePolling';
import type { InterviewSummary } from '../lib/projection';
import { createProjector } from '../lib/projection';
import { statusMeta } from '../lib/status';
import { useDataSource } from './source';

export interface PollingState {
  enabled: boolean;
  intervalMs: number;
  /** True while the tab is hidden and polling is suspended. */
  pausedByVisibility: boolean;
}

export interface InterviewsValue {
  raw: Interview[] | null;
  summaries: InterviewSummary[] | null;
  error: unknown;
  refreshing: boolean;
  /** Epoch ms of the last successful load, on the source's clock. */
  lastLoadedAt: number | null;
  polling: PollingState;
  reload: () => void;
}

const InterviewsContext = createContext<InterviewsValue | null>(null);

export function useInterviews(): InterviewsValue {
  const value = useContext(InterviewsContext);
  if (value === null) {
    throw new Error('useInterviews must be used inside an InterviewsProvider.');
  }
  return value;
}

interface Props {
  /** Poll interval while something is still moving. */
  activeIntervalMs: number;
  children: React.ReactNode;
}

/** Idle polling is deliberately slower: nothing is moving, but rows can appear. */
const IDLE_MULTIPLIER = 3;

export function InterviewsProvider({ activeIntervalMs, children }: Props) {
  const source = useDataSource();
  const { announce } = useAnnouncer();

  const [raw, setRaw] = useState<Interview[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);

  // One projector per source: cached rows keep their identity across polls.
  const project = useMemo(() => createProjector(), [source.mode]);
  const previousStatuses = useRef<Record<string, string>>({});

  const load = useCallback(() => {
    setRefreshing(true);
    source
      .listInterviews()
      .then((data) => {
        setRaw(data);
        setError(null);
        setLastLoadedAt(source.now());
      })
      .catch((cause) => setError(cause))
      .finally(() => setRefreshing(false));
  }, [source]);

  // Reload from scratch when the source changes (mode switch, config change).
  useEffect(() => {
    setRaw(null);
    setError(null);
    previousStatuses.current = {};
    load();
  }, [load]);

  const summaries = useMemo(() => (raw === null ? null : project(raw)), [raw, project]);

  // Announce transitions the user did not cause.
  useEffect(() => {
    if (summaries === null) return;
    const previous = previousStatuses.current;
    const next: Record<string, string> = {};
    const changes: string[] = [];

    for (const summary of summaries) {
      next[summary.id] = summary.status;
      const before = previous[summary.id];
      if (before !== undefined && before !== summary.status) {
        const who = summary.candidateName ?? summary.jobId ?? summary.id;
        changes.push(`${who}: ${statusMeta(summary.status).label}`);
      }
    }

    previousStatuses.current = next;
    if (changes.length === 0) return;
    announce(
      changes.length === 1
        ? `Status atualizado — ${changes[0]}.`
        : `${changes.length} entrevistas mudaram de status: ${changes.join('; ')}.`,
    );
  }, [summaries, announce]);

  const hasLiveWork = useMemo(
    () =>
      summaries !== null &&
      summaries.some((summary) => statusMeta(summary.status).category === 'processing'),
    [summaries],
  );

  // The demo has no background worker: nothing moves unless the user steps the
  // clock, so polling it would burn renders to re-read the same array.
  const pollingEnabled = source.mode === 'api' && raw !== null;
  const intervalMs = hasLiveWork ? activeIntervalMs : activeIntervalMs * IDLE_MULTIPLIER;

  usePolling(load, { intervalMs, enabled: pollingEnabled });

  // Mirror the visibility state so the observability screen can report it.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => setHidden(document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  const value = useMemo<InterviewsValue>(
    () => ({
      raw,
      summaries,
      error,
      refreshing,
      lastLoadedAt,
      polling: {
        enabled: pollingEnabled,
        intervalMs,
        pausedByVisibility: pollingEnabled && hidden,
      },
      reload: load,
    }),
    [raw, summaries, error, refreshing, lastLoadedAt, pollingEnabled, intervalMs, hidden, load],
  );

  return <InterviewsContext.Provider value={value}>{children}</InterviewsContext.Provider>;
}
