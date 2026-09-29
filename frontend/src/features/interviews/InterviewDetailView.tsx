import { useCallback, useEffect, useMemo, useState } from 'react';

import { errorMessage } from '../../api/errors';
import type { DecisionAction, Interview } from '../../api/types';
import type { Route } from '../../app/routes';
import { ErrorState } from '../../components/ErrorState';
import { StatusBadge } from '../../components/StatusBadge';
import { useAnnouncer } from '../../components/ui/Announcer';
import { Gap } from '../../components/ui/Gap';
import { Icon } from '../../components/ui/Icon';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { useInterviews } from '../../data/InterviewsProvider';
import { useDataSource } from '../../data/source';
import { hrefFor } from '../../hooks/useHashRoute';
import { usePolling } from '../../hooks/usePolling';
import { formatDateTime, formatDuration, formatRelative, parseTimestamp } from '../../lib/format';
import { statusMeta } from '../../lib/status';
import { buildTurns } from '../../lib/transcript';
import { DecisionActions } from './DecisionActions';
import { DeliveryHistory } from './DeliveryHistory';
import { FailurePanel } from './FailurePanel';
import { Scorecard } from './Scorecard';
import { Transcript } from './Transcript';

interface Props {
  route: Route;
  id: string;
}

/**
 * The review screen: the model's scorecard on the left, the transcript it
 * claims to be quoting on the right, and the human decision after the
 * evidence — in reading order, so nobody decides before seeing why.
 */
export function InterviewDetailView({ route, id }: Props) {
  const source = useDataSource();
  const { reload: reloadList, jobTitles } = useInterviews();
  const { announce } = useAnnouncer();

  const [interview, setInterview] = useState<Interview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [rollbackNotice, setRollbackNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    source
      .getInterview(id)
      .then((data) => {
        setInterview(data);
        setError(null);
      })
      .catch((cause) => setError(cause));
  }, [source, id]);

  useEffect(() => {
    setInterview(null);
    setError(null);
    load();
  }, [load]);

  const isProcessing =
    interview !== null && statusMeta(interview.status).category === 'processing';
  usePolling(load, { intervalMs: 5000, enabled: source.mode === 'api' && isProcessing });

  // The text every quote is checked against — the same consolidation the
  // backend's EvidenceValidator performs before comparing.
  const transcriptText = useMemo(() => {
    if (interview === null) return null;
    const turns = buildTurns(interview.transcription_raw, interview.diarization_raw);
    return turns.length > 0 ? turns.map((turn) => turn.text).join(' ') : null;
  }, [interview]);

  const evaluations = interview?.scorecard?.evaluations;
  const tally = useMemo(() => {
    const list = Array.isArray(evaluations) ? evaluations : [];
    return {
      total: list.length,
      found: list.filter((item) => item.evidence_verified === true).length,
      flagged: list.filter((item) => item.evidence_verified === false).length,
    };
  }, [evaluations]);

  const handleDecide = useCallback(
    async (action: DecisionAction): Promise<void> => {
      const previous = interview;
      if (previous === null) return;

      // Optimistic: the decision is the one interaction where latency is most
      // visible, and the outcome is almost always the one we predict.
      setRollbackNotice(null);
      setInterview({
        ...previous,
        status: action === 'approve' ? 'aprovada' : 'rejeitada',
      });

      try {
        await source.decide(id, action);
        announce(
          action === 'approve' ? 'Candidatura aprovada.' : 'Candidatura rejeitada.',
          'assertive',
        );
        load();
        reloadList();
      } catch (cause) {
        // Rollback has to be visible, not silent: the user saw the status flip
        // and must be told it did not stick, and why.
        setInterview(previous);
        setRollbackNotice(
          `A decisão não foi registrada e o status foi revertido. ${errorMessage(cause)}`,
        );
        load();
        throw cause;
      }
    },
    [interview, source, id, load, reloadList, announce],
  );

  const handleReprocess = useCallback(async () => {
    await source.reprocess(id);
    load();
    reloadList();
  }, [source, id, load, reloadList]);

  if (error !== null && interview === null) {
    return <ErrorState error={error} onRetry={load} route={route} />;
  }

  if (interview === null) {
    return <SkeletonRows rows={6} label="Carregando entrevista…" />;
  }

  const meta = statusMeta(interview.status);
  const audit = source.capabilities.auditTrail ? (source.auditTrail?.(id) ?? []) : null;
  const jobTitle = interview.job_id === null ? null : (jobTitles[interview.job_id] ?? interview.job_id);
  const here: Route = { mode: route.mode, name: 'interview', id, clockAnchor: route.clockAnchor };
  const highlightQuote =
    route.quote === undefined || !Array.isArray(evaluations)
      ? null
      : (evaluations[route.quote]?.evidence_quote ?? null);

  return (
    <div className="page detail">
      <a
        className="back-link"
        href={hrefFor({ mode: route.mode, name: 'interviews', clockAnchor: route.clockAnchor })}
      >
        <Icon name="arrowLeft" />
        Todas as entrevistas
      </a>

      <header className="detail-head">
        <p className="page-head__eyebrow">
          {jobTitle ?? 'Sem vaga'} <span aria-hidden="true">·</span> gravada{' '}
          {formatRelative(interview.created_at, source.now())}
        </p>
        <div className="page-head__title">
          <h1>
            {interview.scorecard?.candidate_name ??
              (meta.category === 'processing' ? 'Entrevista em processamento' : 'Entrevista sem scorecard')}
          </h1>
          <StatusBadge status={interview.status} />
        </div>
        <p className="page-head__lede">{meta.description}</p>
        {tally.total > 0 && (
          <p className="verdict">
            <span className="verdict__item">
              <strong>{tally.total}</strong> competências avaliadas
            </span>
            <span className="verdict__item verdict__item--ok">
              <Icon name="check" />
              <strong>{tally.found}</strong> {tally.found === 1 ? 'citação encontrada' : 'citações encontradas'}
            </span>
            {tally.flagged > 0 && (
              <span className="verdict__item verdict__item--alert">
                <Icon name="alert" />
                <strong>{tally.flagged}</strong>{' '}
                {tally.flagged === 1 ? 'não está na transcrição' : 'não estão na transcrição'}
              </span>
            )}
          </p>
        )}
      </header>

      {rollbackNotice !== null && (
        <p className="notice notice--danger" role="alert">
          <Icon name="alert" />
          <span>{rollbackNotice}</span>
        </p>
      )}

      {interview.status === 'falhou' && (
        <FailurePanel
          errorLog={interview.error_log}
          retryCount={interview.retry_count}
          onReprocess={handleReprocess}
        />
      )}

      <div className="detail__grid">
        <div className="detail__main">
          {interview.scorecard !== null ? (
            <Scorecard
              scorecard={interview.scorecard}
              jobId={interview.job_id}
              transcript={transcriptText}
              quoteHref={(index) => hrefFor({ ...here, quote: index })}
              activeQuote={route.quote ?? null}
            />
          ) : (
            <section className="panel">
              <p className="detail__pending">
                {meta.category === 'processing'
                  ? 'O scorecard ainda não existe — a entrevista está sendo processada. O nome da pessoa também vem dele.'
                  : 'Nenhum scorecard disponível para esta entrevista.'}
              </p>
            </section>
          )}

          <section className="decision-panel" aria-labelledby="decisao-title" data-tour="decision">
            <h2 id="decisao-title">Sua decisão</h2>
            <p className="decision-panel__lede">
              O pipeline nunca aprova nem rejeita sozinho. Esta etapa é de uma pessoa, uma
              candidatura por vez.
            </p>
            <DecisionActions
              status={interview.status}
              candidateName={interview.scorecard?.candidate_name ?? null}
              flaggedCount={tally.flagged}
              onDecide={handleDecide}
            />
            {audit === null ? (
              <Gap gap="decisionAuthor" title="Autoria da decisão" variant="inline" />
            ) : (
              <AuditTrail entries={audit} now={source.now()} />
            )}
          </section>

          <DeliveryHistory interviewId={id} hasScorecard={interview.scorecard !== null} />

          <details className="tech-details">
            <summary>Detalhes técnicos da entrevista</summary>
            <dl className="tech-details__list">
              <Field label="ID" value={<code>{interview.id}</code>} />
              <Field label="Vaga (job_id)" value={interview.job_id ?? '—'} />
              <Field
                label="ID externo"
                value={interview.external_id ? <code>{interview.external_id}</code> : 'não informado'}
              />
              <Field label="Gravação" value={<code className="break">{interview.recording_url}</code>} />
              <Field
                label="Criada em"
                value={`${formatDateTime(interview.created_at)} (${formatRelative(interview.created_at, source.now())})`}
              />
              <Field
                label="Última atualização"
                value={`${formatDateTime(interview.updated_at)} (há ${formatDuration(
                  source.now() - parseTimestamp(interview.updated_at).getTime(),
                )})`}
              />
              <Field label="Tentativas de reprocessamento" value={String(interview.retry_count)} />
            </dl>
          </details>
        </div>

        <aside className="detail__side" aria-labelledby="transcricao-title">
          <section className="transcript-panel">
            <h2 id="transcricao-title">Transcrição</h2>
            <p className="transcript-panel__lede">
              O que foi dito de fato. É aqui que cada citação do modelo é procurada.
            </p>
            <Transcript
              transcription={interview.transcription_raw}
              diarization={interview.diarization_raw}
              highlightQuote={highlightQuote}
              clearHref={hrefFor(here)}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="tech-details__field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function AuditTrail({
  entries,
  now,
}: {
  entries: { id: string; at: number; actor: string; action: string; detail?: string }[];
  now: number;
}) {
  if (entries.length === 0) {
    return (
      <p className="audit__empty">Nenhuma decisão registrada ainda nesta demonstração.</p>
    );
  }

  return (
    <div className="audit">
      <h3 className="audit__title">
        Trilha de auditoria
        <span className="pill pill--synthetic">sintética</span>
      </h3>
      <p className="audit__note">
        Registro simulado: a API real não guarda quem decidiu — a autenticação é uma chave
        compartilhada.
      </p>
      <ol className="audit__list">
        {entries.map((entry) => (
          <li key={entry.id} className="audit__entry">
            <span className="audit__when">
              {formatDateTime(new Date(entry.at).toISOString())} ·{' '}
              {formatRelative(new Date(entry.at).toISOString(), now)}
            </span>
            <span className="audit__what">
              <strong>{entry.actor}</strong> — {entry.action}
            </span>
            {entry.detail !== undefined && <span className="audit__detail">{entry.detail}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
