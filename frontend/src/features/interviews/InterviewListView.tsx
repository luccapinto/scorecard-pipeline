import { memo, useMemo, useState } from 'react';

import type { Route } from '../../app/routes';
import { ErrorState } from '../../components/ErrorState';
import { StatusBadge } from '../../components/StatusBadge';
import { Icon } from '../../components/ui/Icon';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { VirtualList } from '../../components/ui/VirtualList';
import { useInterviews } from '../../data/InterviewsProvider';
import { useDataSource } from '../../data/source';
import { hrefFor } from '../../hooks/useHashRoute';
import { formatDuration, formatRelative, formatScore, shortId } from '../../lib/format';
import { msSinceUpdate } from '../../lib/metrics';
import type { InterviewSummary } from '../../lib/projection';
import type { StatusFilter } from '../../lib/status';
import { statusMeta } from '../../lib/status';
import { PipelineSummary } from './PipelineSummary';

interface Props {
  route: Route;
  /** Filter preselected by the dashboard tiles. */
  initialFilter?: StatusFilter;
}

// Past this many rows the list windows itself; see VirtualList for why the
// cheap path is kept for everything below it.
const VIRTUALIZE_ABOVE = 200;

export function InterviewListView({ route }: Props) {
  const source = useDataSource();
  const { summaries, error, refreshing, reload } = useInterviews();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    if (summaries === null) return [];
    const needle = query.trim().toLowerCase();

    const matchesFilter = (summary: InterviewSummary) => {
      if (filter === 'all') return true;
      if (filter === 'action_required') return summary.needsAction;
      return summary.status === filter;
    };

    const matchesQuery = (summary: InterviewSummary) =>
      needle === '' ||
      (summary.candidateName ?? '').toLowerCase().includes(needle) ||
      (summary.jobId ?? '').toLowerCase().includes(needle) ||
      summary.id.toLowerCase().includes(needle) ||
      (summary.externalId ?? '').toLowerCase().includes(needle);

    // Items needing a human float to the top; order within a group is the
    // incoming newest-first order.
    const order: Record<string, number> = { action_required: 0, processing: 1, done: 2 };
    return summaries
      .filter((summary) => matchesFilter(summary) && matchesQuery(summary))
      .map((summary, index) => ({ summary, index }))
      .sort((a, b) => {
        const rank =
          order[statusMeta(a.summary.status).category] -
          order[statusMeta(b.summary.status).category];
        return rank !== 0 ? rank : a.index - b.index;
      })
      .map((entry) => entry.summary);
  }, [summaries, filter, query]);

  if (error !== null && summaries === null) {
    return <ErrorState error={error} onRetry={reload} route={route} />;
  }

  if (summaries === null) {
    return <SkeletonRows rows={8} label="Carregando entrevistas…" />;
  }

  const now = source.now();

  return (
    <div className="list-view">
      <div className="view-head">
        <div className="view-head__text">
          <div className="view-head__title">
            <h1>Entrevistas</h1>
            {refreshing && (
              <span className="chip chip--muted" role="status">
                atualizando…
              </span>
            )}
          </div>
          <p className="view-head__sub">
            Todas as entrevistas da esteira, com as que precisam de uma pessoa no topo.
          </p>
        </div>
        <div className="view-head__actions">
          <a
            className="btn btn--primary"
            href={hrefFor({ mode: route.mode, name: 'new', clockAnchor: route.clockAnchor })}
          >
            <Icon name="plus" />
            Nova entrevista
          </a>
        </div>
      </div>

      {error !== null && (
        <p className="banner banner--warn" role="alert">
          <Icon name="alert" />
          Falha ao atualizar; exibindo os últimos dados carregados.
        </p>
      )}

      <PipelineSummary summaries={summaries} active={filter} onSelect={setFilter} />

      <div className="list-view__search">
        <label htmlFor="busca-entrevistas" className="sr-only">
          Buscar por candidato, vaga ou ID
        </label>
        <Icon name="search" />
        <input
          id="busca-entrevistas"
          type="search"
          value={query}
          placeholder="Buscar por candidato, vaga ou ID…"
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="list-view__count" role="status">
          {visible.length} de {summaries.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <Icon name="search" size="1.5rem" />
          <p className="empty__title">Nenhuma entrevista neste filtro.</p>
          <p className="empty__hint">
            {summaries.length === 0
              ? 'Crie uma nova entrevista para começar.'
              : 'Ajuste o filtro ou a busca acima.'}
          </p>
        </div>
      ) : (
        <VirtualList
          items={visible}
          threshold={VIRTUALIZE_ABOVE}
          rowHeight={76}
          viewportHeight={640}
          className="interview-list"
          aria-label="Lista de entrevistas"
        >
          {(summary) => (
            <InterviewRow key={summary.id} summary={summary} route={route} now={now} />
          )}
        </VirtualList>
      )}
    </div>
  );
}

interface RowProps {
  summary: InterviewSummary;
  route: Route;
  now: number;
}

// Memoised on the projected summary: the projector keeps row identity stable
// across polls, so an unchanged row does not re-render when the list refreshes.
const InterviewRow = memo(function InterviewRow({ summary, route, now }: RowProps) {
  return (
    <li className={`row ${summary.needsAction ? 'row--action' : ''}`}>
      <a
        className="row__link"
        href={hrefFor({
          mode: route.mode,
          name: 'interview',
          id: summary.id,
          clockAnchor: route.clockAnchor,
        })}
      >
        <span className="row__main">
          <span className="row__candidate">
            {summary.candidateName ?? <span className="muted">Sem scorecard ainda</span>}
          </span>
          <span className="row__sub">
            <span className="row__job">{summary.jobId ?? 'sem vaga'}</span>
            <span className="row__id mono">{shortId(summary.id)}</span>
          </span>
        </span>

        <span className="row__signals">
          {summary.hasEvidenceAlert && (
            <span className="chip chip--danger">
              <Icon name="alert" />
              evidência não verificada
            </span>
          )}
          {summary.averageScore !== null && (
            <span className="chip chip--muted" title="Nota média das competências">
              média {formatScore(summary.averageScore)}
            </span>
          )}
        </span>

        <span className="row__meta">
          <StatusBadge status={summary.status} size="sm" />
          <span className="row__time" title={`Criada ${formatRelative(summary.createdAtIso, now)}`}>
            {/* updated_at moves on any write, so this is explicitly labelled
                as time since last update, never as time in stage. */}
            há {formatDuration(msSinceUpdate(summary, now))} sem mudança
          </span>
        </span>
      </a>
    </li>
  );
});
