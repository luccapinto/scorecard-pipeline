import { useCallback, useEffect, useState } from 'react';

import type { ApiConfig } from '../../api/client';
import { listInterviews } from '../../api/client';
import type { Interview } from '../../api/types';
import { EmptyState, Loading } from '../../components/Loading';
import { ErrorState } from '../../components/ErrorState';
import { StatusBadge } from '../../components/StatusBadge';
import { usePolling } from '../../hooks/usePolling';
import { formatRelative } from '../../lib/format';
import { shortId } from '../../lib/format';
import type { StatusFilter } from '../../lib/status';
import { filterInterviews, hasLiveWork, needsAction, sortByActionPriority } from '../../lib/status';
import { PipelineSummary } from './PipelineSummary';

interface Props {
  config: ApiConfig;
  onOpen: (id: string) => void;
  onOpenConfig: () => void;
  onNew: () => void;
}

const POLL_INTERVAL_MS = 5000;

export function InterviewListView({ config, onOpen, onOpenConfig, onNew }: Props) {
  const [interviews, setInterviews] = useState<Interview[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    listInterviews(config)
      .then((data) => {
        setInterviews(data);
        setError(null);
      })
      .catch((err) => setError(err))
      .finally(() => setRefreshing(false));
  }, [config]);

  // Reload from scratch whenever the API config changes.
  useEffect(() => {
    setInterviews(null);
    setError(null);
    load();
  }, [load]);

  // Keep polling while there is live work; still poll (slowly is fine) even
  // when idle so external changes and new interviews show up.
  const pollingEnabled = interviews === null ? false : true;
  usePolling(load, {
    intervalMs: hasLiveWork(interviews ?? []) ? POLL_INTERVAL_MS : POLL_INTERVAL_MS * 3,
    enabled: pollingEnabled,
  });

  if (error && interviews === null) {
    return <ErrorState error={error} onRetry={load} onOpenConfig={onOpenConfig} />;
  }

  if (interviews === null) {
    return <Loading label="Carregando entrevistas…" />;
  }

  const visible = sortByActionPriority(filterInterviews(interviews, filter));

  return (
    <div className="list-view">
      <div className="list-view__toolbar">
        <h1 className="list-view__title">
          Esteira de entrevistas
          {refreshing && (
            <span className="list-view__refreshing" role="status" aria-live="polite">
              atualizando…
            </span>
          )}
        </h1>
        <button type="button" className="btn btn--primary" onClick={onNew}>
          Nova entrevista
        </button>
      </div>

      {error != null && (
        <div className="list-view__stale" role="alert">
          Falha ao atualizar; exibindo os últimos dados carregados.
        </div>
      )}

      <PipelineSummary interviews={interviews} active={filter} onSelect={setFilter} />

      {visible.length === 0 ? (
        <EmptyState
          title="Nenhuma entrevista neste filtro."
          hint={
            interviews.length === 0
              ? 'Crie uma nova entrevista para começar.'
              : 'Ajuste o filtro acima para ver outros estágios.'
          }
        />
      ) : (
        <ul className="interview-list">
          {visible.map((interview) => (
            <li
              key={interview.id}
              className={`interview-row ${
                needsAction(interview.status) ? 'interview-row--action' : ''
              }`}
            >
              <button
                type="button"
                className="interview-row__button"
                onClick={() => onOpen(interview.id)}
                aria-label={`Abrir entrevista ${shortId(interview.id)}, status ${interview.status}`}
              >
                <span className="interview-row__main">
                  <span className="interview-row__job">{interview.job_id ?? 'sem vaga'}</span>
                  <span className="interview-row__candidate">
                    {interview.scorecard?.candidate_name ?? '—'}
                  </span>
                </span>
                <span className="interview-row__meta">
                  <StatusBadge status={interview.status} />
                  <span className="interview-row__time">{formatRelative(interview.created_at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
