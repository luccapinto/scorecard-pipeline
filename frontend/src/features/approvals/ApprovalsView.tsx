import { useMemo } from 'react';

import type { Route } from '../../app/routes';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/ui/Icon';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { useInterviews } from '../../data/InterviewsProvider';
import { useDataSource } from '../../data/source';
import { hrefFor } from '../../hooks/useHashRoute';
import { formatDateTime, formatDuration, formatScore } from '../../lib/format';
import { msSinceUpdate } from '../../lib/metrics';

interface Props {
  route: Route;
}

// The approval queue.
//
// Deliberately has NO bulk action, not even in the demo. "Approve 12 selected"
// is the single feature that would contradict everything this system is for:
// the pipeline stops precisely so that a person looks at one candidate at a
// time. Every row here is a link into the full scorecard, because deciding
// without reading the evidence is the failure mode, not the shortcut.
export function ApprovalsView({ route }: Props) {
  const source = useDataSource();
  const { summaries, error, reload } = useInterviews();
  const now = source.now();

  const queue = useMemo(() => {
    if (summaries === null) return [];
    return summaries
      .filter((summary) => summary.status === 'aguardando_aprovacao')
      .sort((a, b) => a.updatedAt - b.updatedAt);
  }, [summaries]);

  if (error !== null && summaries === null) {
    return <ErrorState error={error} onRetry={reload} route={route} />;
  }

  if (summaries === null) {
    return <SkeletonRows rows={5} label="Carregando fila de aprovação…" />;
  }

  return (
    <div className="approvals">
      <div className="view-head">
        <div className="view-head__text">
          <h1>Aprovações</h1>
          <p className="view-head__sub">
            Entrevistas cujo scorecard está pronto e que aguardam decisão humana, da que espera
            há mais tempo para a mais recente.
          </p>
        </div>
      </div>

      <p className="banner banner--info">
        <Icon name="gavel" />
        <span>
          Cada decisão é individual e em duas etapas. Não existe aprovação em massa nesta
          interface — é uma decisão sobre o processo seletivo de uma pessoa.
        </span>
      </p>

      {queue.length === 0 ? (
        <div className="empty">
          <Icon name="check" size="1.5rem" />
          <p className="empty__title">Nada aguardando decisão.</p>
          <p className="empty__hint">
            Quando o scorecard de uma entrevista ficar pronto, ela aparece aqui.
          </p>
        </div>
      ) : (
        <ul className="approval-list">
          {queue.map((summary) => (
            <li
              key={summary.id}
              className={`approval ${summary.hasEvidenceAlert ? 'approval--flagged' : ''}`}
            >
              <div className="approval__head">
                <h2 className="approval__name">{summary.candidateName ?? 'Sem scorecard'}</h2>
                <span className="approval__wait">
                  aguardando há {formatDuration(msSinceUpdate(summary, now))}
                </span>
              </div>

              <dl className="approval__facts">
                <div>
                  <dt>Vaga</dt>
                  <dd>{summary.jobId ?? '—'}</dd>
                </div>
                <div>
                  <dt>Recomendação do modelo</dt>
                  <dd>{summary.recommendation ?? '—'}</dd>
                </div>
                <div>
                  <dt>Nota média</dt>
                  <dd>
                    {formatScore(summary.averageScore)}
                    <span className="muted"> /5</span>
                  </dd>
                </div>
                <div>
                  <dt>Competências</dt>
                  <dd>{summary.competencyCount}</dd>
                </div>
                <div>
                  <dt>Pronto desde</dt>
                  <dd>{formatDateTime(summary.updatedAtIso)}</dd>
                </div>
              </dl>

              {summary.hasEvidenceAlert ? (
                <p className="approval__alert" role="alert">
                  <Icon name="alert" />
                  <span>
                    <strong>
                      {summary.evidence.unverified === 1
                        ? '1 citação não foi encontrada'
                        : `${summary.evidence.unverified} citações não foram encontradas`}{' '}
                      na transcrição.
                    </strong>{' '}
                    Abra o scorecard e confirme antes de decidir.
                  </span>
                </p>
              ) : (
                <p className="approval__ok">
                  <Icon name="check" />
                  <span>
                    {summary.evidence.verified} de{' '}
                    {summary.evidence.verified + summary.evidence.unverified} citações conferidas
                    foram localizadas na transcrição.
                    {summary.evidence.unchecked > 0 &&
                      ` ${summary.evidence.unchecked} não passaram por verificação automática.`}
                  </span>
                </p>
              )}

              <a
                className="btn btn--primary"
                href={hrefFor({
                  mode: route.mode,
                  name: 'interview',
                  id: summary.id,
                  clockAnchor: route.clockAnchor,
                })}
              >
                Abrir scorecard e decidir
                <Icon name="arrowRight" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
