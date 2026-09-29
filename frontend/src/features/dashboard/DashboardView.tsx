import { useMemo, useState } from 'react';

import type { Route } from '../../app/routes';
import { BarChart } from '../../components/charts/BarChart';
import { RateGauge } from '../../components/charts/RateGauge';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/ui/Icon';
import { PageHeader } from '../../components/ui/PageHeader';
import { SkeletonCards } from '../../components/ui/Skeleton';
import { useDemoControls } from '../../data/demoControls';
import { useInterviews } from '../../data/InterviewsProvider';
import { useDataSource } from '../../data/source';
import { hrefFor } from '../../hooks/useHashRoute';
import { formatDuration, formatPercent, formatScore } from '../../lib/format';
import type { PeriodKey } from '../../lib/metrics';
import { PERIODS, computeMetrics, msSinceUpdate, withinPeriod } from '../../lib/metrics';
import type { InterviewSummary } from '../../lib/projection';
import { statusMeta } from '../../lib/status';
import { PipelineBoard } from './PipelineBoard';

interface Props {
  route: Route;
}

export function DashboardView({ route }: Props) {
  const source = useDataSource();
  const demo = useDemoControls();
  const { summaries, error, reload, jobTitles } = useInterviews();
  const [period, setPeriod] = useState<PeriodKey>('7d');

  const now = source.now();
  const inPeriod = useMemo(
    () => (summaries === null ? [] : withinPeriod(summaries, period, now)),
    [summaries, period, now],
  );
  const metrics = useMemo(() => computeMetrics(inPeriod, now), [inPeriod, now]);

  // Flagged evidence first, then the longest wait: the item most likely to
  // be decided on a sentence nobody said is the one to look at first.
  const awaiting = useMemo(
    () =>
      (summaries ?? [])
        .filter((summary) => summary.status === 'aguardando_aprovacao')
        .sort(
          (a, b) =>
            Number(b.hasEvidenceAlert) - Number(a.hasEvidenceAlert) || a.updatedAt - b.updatedAt,
        ),
    [summaries],
  );

  if (error !== null && summaries === null) {
    return <ErrorState error={error} onRetry={reload} route={route} />;
  }

  const simulated =
    demo?.simulatedId == null
      ? undefined
      : (summaries ?? []).find((summary) => summary.id === demo.simulatedId);

  return (
    <div className="page esteira">
      <PageHeader
        eyebrow="Esteira"
        title="Da gravação à decisão"
        lede="Cada entrevista atravessa estas etapas sozinha e para antes da decisão — que é sempre de uma pessoa. Abra qualquer cartão para ver o scorecard e as evidências."
        actions={
          demo !== null ? (
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={demo.simulate}
              disabled={demo.playingId !== null}
              data-tour="simulate"
            >
              <Icon name="play" />
              {demo.playingId !== null ? 'Processando…' : 'Simular nova entrevista'}
            </button>
          ) : (
            <a
              className="btn btn--primary btn--lg"
              href={hrefFor({ mode: route.mode, name: 'new', clockAnchor: route.clockAnchor })}
            >
              <Icon name="plus" />
              Nova entrevista
            </a>
          )
        }
      />

      {demo !== null && simulated !== undefined && (
        <SimulationNote summary={simulated} playing={demo.playingId === simulated.id} route={route} />
      )}

      {summaries === null ? (
        <SkeletonCards cards={6} label="Carregando a esteira…" />
      ) : (
        <PipelineBoard
          summaries={summaries}
          route={route}
          jobTitles={jobTitles}
          playingId={demo?.playingId ?? null}
          simulatedId={demo?.simulatedId ?? null}
        />
      )}

      {summaries !== null && (
        <section className="section" aria-labelledby="needs-title">
          <div className="section__head">
            <h2 id="needs-title">Esperando uma pessoa</h2>
            <p className="section__lede">
              Scorecards prontos. Os que têm citação não encontrada vêm primeiro: são os que mais
              precisam de um olhar humano.
            </p>
          </div>
          {awaiting.length === 0 ? (
            <p className="muted">Nada esperando decisão agora.</p>
          ) : (
            <ul className="needs">
              {awaiting.map((summary) => (
                <NeedsRow
                  key={summary.id}
                  summary={summary}
                  route={route}
                  now={now}
                  jobTitle={summary.jobId === null ? null : (jobTitles[summary.jobId] ?? summary.jobId)}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {summaries !== null && (
        <section className="section section--quiet" aria-labelledby="numbers-title">
          <div className="section__head section__head--row">
            <div>
              <h2 id="numbers-title">Em números</h2>
              <p className="section__lede">
                {metrics.scoredCount === 0
                  ? 'Ainda não há scorecards no período.'
                  : `${metrics.scoredCount} scorecards no período, nota média ${formatScore(metrics.averageScore)}. ${formatPercent(metrics.evidenceRate)} das citações conferidas foram encontradas na transcrição.`}
              </p>
            </div>
            <label className="field-inline">
              <span>Período</span>
              <select value={period} onChange={(event) => setPeriod(event.target.value as PeriodKey)}>
                {Object.entries(PERIODS).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="numbers">
            <div className="numbers__item">
              <h3 className="numbers__title">Notas atribuídas, de 1 a 5</h3>
              <BarChart
                title="Distribuição das notas atribuídas, de 1 a 5 na escala BARS"
                labelHeader="Nota"
                valueHeader="Avaliações"
                unit=" avaliações"
                data={metrics.scoreDistribution.map((count, index) => ({
                  label: `nota ${index + 1}`,
                  value: count,
                  color: `var(--chart-${index + 1})`,
                  description: `Nota ${index + 1}`,
                }))}
              />
            </div>
            <div className="numbers__item">
              <h3 className="numbers__title">Citações conferidas</h3>
              <RateGauge
                rate={metrics.evidenceRate}
                caption="encontradas na transcrição"
                title="Resultado da verificação de evidência no período"
                segments={[
                  { label: 'Encontradas', value: metrics.evidence.verified, color: 'var(--ok)' },
                  {
                    label: 'Não encontradas',
                    value: metrics.evidence.unverified,
                    color: 'var(--danger)',
                  },
                  {
                    label: 'Sem verificação',
                    value: metrics.evidence.unchecked,
                    color: 'var(--neutral)',
                  },
                ]}
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SimulationNote({
  summary,
  playing,
  route,
}: {
  summary: InterviewSummary;
  playing: boolean;
  route: Route;
}) {
  const meta = statusMeta(summary.status);
  return (
    <p className={`sim-note ${playing ? 'is-playing' : ''}`} role="status">
      <span className="sim-note__pulse" aria-hidden="true" />
      {playing ? (
        <span>
          Nova entrevista na esteira: <strong>{meta.label}</strong>. {meta.description}
        </span>
      ) : summary.status === 'aguardando_aprovacao' ? (
        <span>
          <strong>{summary.candidateName ?? 'A nova entrevista'}</strong> está pronta para revisão
          {summary.hasEvidenceAlert && ' — e o scorecard traz uma citação que não está na transcrição'}
          .{' '}
          <a
            href={hrefFor({
              mode: route.mode,
              name: 'interview',
              id: summary.id,
              clockAnchor: route.clockAnchor,
            })}
          >
            Abrir o scorecard
          </a>
        </span>
      ) : (
        <span>
          A entrevista simulada está em <strong>{meta.label}</strong>.
        </span>
      )}
    </p>
  );
}

function NeedsRow({
  summary,
  route,
  now,
  jobTitle,
}: {
  summary: InterviewSummary;
  route: Route;
  now: number;
  jobTitle: string | null;
}) {
  const checked = summary.evidence.verified + summary.evidence.unverified;
  return (
    <li className={`needs__item ${summary.hasEvidenceAlert ? 'needs__item--alert' : ''}`}>
      <a
        className="needs__link"
        href={hrefFor({ mode: route.mode, name: 'interview', id: summary.id, clockAnchor: route.clockAnchor })}
      >
        <span className="needs__who">
          <span className="needs__name">{summary.candidateName ?? 'Sem nome'}</span>
          <span className="needs__job">{jobTitle ?? 'Sem vaga'}</span>
        </span>
        <span className={`needs__evidence ${summary.hasEvidenceAlert ? 'is-alert' : 'is-ok'}`}>
          <Icon name={summary.hasEvidenceAlert ? 'alert' : 'check'} />
          {summary.hasEvidenceAlert
            ? `${summary.evidence.unverified} de ${checked} citações não encontradas`
            : checked === 0
              ? 'citações sem verificação automática'
              : `${summary.evidence.verified} de ${checked} citações encontradas`}
        </span>
        <span className="needs__meta">
          média {formatScore(summary.averageScore)} · esperando há{' '}
          {formatDuration(msSinceUpdate(summary, now))}
        </span>
        <Icon name="arrowRight" className="needs__go" />
      </a>
    </li>
  );
}
