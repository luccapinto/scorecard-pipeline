import { useMemo, useState } from 'react';

import type { Route } from '../../app/routes';
import { BarChart } from '../../components/charts/BarChart';
import { RateGauge } from '../../components/charts/RateGauge';
import { ErrorState } from '../../components/ErrorState';
import { StatusBadge } from '../../components/StatusBadge';
import { Icon } from '../../components/ui/Icon';
import { SkeletonCards, SkeletonRows } from '../../components/ui/Skeleton';
import { useInterviews } from '../../data/InterviewsProvider';
import { useDataSource } from '../../data/source';
import { hrefFor } from '../../hooks/useHashRoute';
import { formatDuration, formatPercent, formatScore, shortId } from '../../lib/format';
import type { PeriodKey } from '../../lib/metrics';
import { PERIODS, computeMetrics, msSinceUpdate, withinPeriod } from '../../lib/metrics';
import type { InterviewSummary } from '../../lib/projection';
import type { StatusFilter } from '../../lib/status';
import { statusMeta } from '../../lib/status';
import { PipelineSummary } from '../interviews/PipelineSummary';

interface Props {
  route: Route;
}

const PREVIEW_LIMIT = 8;

export function DashboardView({ route }: Props) {
  const source = useDataSource();
  const { summaries, error, reload } = useInterviews();
  const [period, setPeriod] = useState<PeriodKey>('7d');
  const [filter, setFilter] = useState<StatusFilter>('action_required');

  const now = source.now();

  const inPeriod = useMemo(
    () => (summaries === null ? [] : withinPeriod(summaries, period, now)),
    [summaries, period, now],
  );
  const metrics = useMemo(() => computeMetrics(inPeriod, now), [inPeriod, now]);

  const filtered = useMemo(() => {
    if (summaries === null) return [];
    const matching = summaries.filter((summary) => {
      if (filter === 'all') return true;
      if (filter === 'action_required') return summary.needsAction;
      return summary.status === filter;
    });
    // Longest-waiting first: on an operations board, the oldest untouched item
    // is the one most likely to be forgotten.
    return [...matching].sort((a, b) => a.updatedAt - b.updatedAt);
  }, [summaries, filter]);

  if (error !== null && summaries === null) {
    return <ErrorState error={error} onRetry={reload} route={route} />;
  }

  if (summaries === null) {
    return (
      <>
        <SkeletonCards cards={4} label="Carregando métricas da esteira…" />
        <SkeletonRows rows={6} label="Carregando entrevistas…" />
      </>
    );
  }

  return (
    <div className="dashboard">
      <div className="view-head">
        <div className="view-head__text">
          <h1>Esteira</h1>
          <p className="view-head__sub">
            Onde cada entrevista está, o que precisa de uma pessoa, e quanta evidência o
            verificador conseguiu confirmar.
          </p>
        </div>
        <div className="view-head__actions">
          <label className="field-inline">
            <span>Período</span>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value as PeriodKey)}
            >
              {Object.entries(PERIODS).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <section className="stats" aria-label="Indicadores do período">
        <Stat
          label="Aguardando decisão"
          value={String(metrics.awaitingApproval)}
          hint={
            metrics.longestWaitMs === null
              ? 'Nada na fila.'
              : `Espera mais longa: ${formatDuration(metrics.longestWaitMs)}`
          }
          tone={metrics.awaitingApproval > 0 ? 'warn' : 'neutral'}
        />
        <Stat
          label="Evidência verificada"
          value={formatPercent(metrics.evidenceRate)}
          hint={
            metrics.interviewsWithAlert === 0
              ? 'Nenhuma citação sinalizada.'
              : `${metrics.interviewsWithAlert} entrevista(s) com citação não encontrada`
          }
          tone={metrics.interviewsWithAlert > 0 ? 'danger' : 'ok'}
        />
        <Stat
          label="Em processamento"
          value={String(metrics.processing)}
          hint={`${metrics.total} entrevista(s) no período`}
          tone="neutral"
        />
        <Stat
          label="Falhas"
          value={String(metrics.failed)}
          hint={metrics.failed === 0 ? 'Nenhuma falha no período.' : 'Precisam de reprocessamento.'}
          tone={metrics.failed > 0 ? 'danger' : 'neutral'}
        />
      </section>

      <div className="charts">
        <section className="card" aria-labelledby="dist-title">
          <h2 id="dist-title" className="card__title">
            Distribuição de notas
          </h2>
          <div className="card__body">
            <p className="card__lead">
              {metrics.scoredCount === 0
                ? 'Ainda não há scorecards no período selecionado.'
                : `${metrics.scoredCount} scorecard(s), média geral ${formatScore(metrics.averageScore)}.`}
            </p>
            <BarChart
              title="Distribuição das notas atribuídas, de 1 a 5 na escala BARS"
              labelHeader="Nota"
              valueHeader="Avaliações"
              unit=" avaliações"
              data={metrics.scoreDistribution.map((count, index) => ({
                label: String(index + 1),
                value: count,
                color: `var(--chart-${index + 1})`,
                description: `Nota ${index + 1}`,
              }))}
            />
          </div>
        </section>

        <section className="card" aria-labelledby="evid-title">
          <h2 id="evid-title" className="card__title">
            Verificação de evidência
          </h2>
          <div className="card__body">
            <p className="card__lead">
              Proporção de citações do modelo que foram efetivamente localizadas na transcrição.
              Citações não verificadas automaticamente ficam fora do cálculo.
            </p>
            <RateGauge
              rate={metrics.evidenceRate}
              caption="das citações conferidas foram encontradas"
              title="Resultado da verificação de evidência no período"
              segments={[
                {
                  label: 'Encontradas',
                  value: metrics.evidence.verified,
                  color: 'var(--ok)',
                },
                {
                  label: 'Não encontradas',
                  value: metrics.evidence.unverified,
                  color: 'var(--danger)',
                },
                {
                  label: 'Não verificadas',
                  value: metrics.evidence.unchecked,
                  color: 'var(--neutral)',
                },
              ]}
            />
          </div>
        </section>
      </div>

      <PipelineSummary summaries={summaries} active={filter} onSelect={setFilter} />

      <section className="card" aria-labelledby="fila-title">
        <div className="card__header">
          <h2 id="fila-title" className="card__title">
            {filter === 'action_required'
              ? 'Precisam de uma pessoa'
              : `Filtro: ${filter === 'all' ? 'todas' : statusMeta(filter).label}`}
          </h2>
          <a
            className="link-button"
            href={hrefFor({ mode: route.mode, name: 'interviews', clockAnchor: route.clockAnchor })}
          >
            Ver lista completa <Icon name="arrowRight" />
          </a>
        </div>
        <div className="card__body">
          {filtered.length === 0 ? (
            <p className="muted">Nada neste filtro.</p>
          ) : (
            <ul className="queue">
              {filtered.slice(0, PREVIEW_LIMIT).map((summary) => (
                <QueueRow key={summary.id} summary={summary} route={route} now={now} />
              ))}
            </ul>
          )}
          {filtered.length > PREVIEW_LIMIT && (
            <p className="muted">
              e mais {filtered.length - PREVIEW_LIMIT} — veja a lista completa.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'ok' | 'warn' | 'danger' | 'neutral';
}) {
  return (
    <div className={`stat stat--${tone}`}>
      <p className="stat__label">{label}</p>
      <p className="stat__value">{value}</p>
      <p className="stat__hint">{hint}</p>
    </div>
  );
}

function QueueRow({
  summary,
  route,
  now,
}: {
  summary: InterviewSummary;
  route: Route;
  now: number;
}) {
  return (
    <li className="queue__item">
      <a
        className="queue__link"
        href={hrefFor({
          mode: route.mode,
          name: 'interview',
          id: summary.id,
          clockAnchor: route.clockAnchor,
        })}
      >
        <span className="queue__who">
          <strong>{summary.candidateName ?? 'Sem scorecard'}</strong>
          <span className="muted">{summary.jobId ?? shortId(summary.id)}</span>
        </span>
        <span className="queue__signals">
          {summary.hasEvidenceAlert && (
            <span className="chip chip--danger">
              <Icon name="alert" />
              evidência
            </span>
          )}
          {summary.recommendation !== null && (
            <span className="chip chip--muted">{summary.recommendation}</span>
          )}
        </span>
        <StatusBadge status={summary.status} size="sm" />
        <span className="queue__age">
          há {formatDuration(msSinceUpdate(summary, now))} sem mudança
        </span>
      </a>
    </li>
  );
}
