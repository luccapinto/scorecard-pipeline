import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { errorMessage } from '../../api/errors';
import type { DecisionAction, Interview } from '../../api/types';
import { ErrorState } from '../../components/ErrorState';
import { StatusBadge } from '../../components/StatusBadge';
import { Gap } from '../../components/ui/Gap';
import { Icon } from '../../components/ui/Icon';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { useInterviews } from '../../data/InterviewsProvider';
import { useDataSource } from '../../data/source';
import { useAnnouncer } from '../../components/ui/Announcer';
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
  id: string;
}

export function InterviewDetailView({ id }: Props) {
  const source = useDataSource();
  const { reload: reloadList } = useInterviews();
  const { announce } = useAnnouncer();

  const [interview, setInterview] = useState<Interview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [highlightQuote, setHighlightQuote] = useState<string | null>(null);
  const [rollbackNotice, setRollbackNotice] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLElement>(null);

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
    setHighlightQuote(null);
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

  const flaggedCount = useMemo(
    () =>
      (interview?.scorecard?.evaluations ?? []).filter(
        (item) => item.evidence_verified === false,
      ).length,
    [interview],
  );

  const onLocateQuote = useCallback((quote: string) => {
    setHighlightQuote(quote);
    transcriptRef.current?.scrollIntoView({ block: 'start' });
  }, []);

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
    return <ErrorState error={error} onRetry={load} />;
  }

  if (interview === null) {
    return <SkeletonRows rows={6} label="Carregando entrevista…" />;
  }

  const meta = statusMeta(interview.status);
  const audit = source.capabilities.auditTrail ? (source.auditTrail?.(id) ?? []) : null;

  return (
    <div className="detail">
      <div className="view-head">
        <div className="view-head__text">
          <div className="view-head__title">
            <h1>{interview.scorecard?.candidate_name ?? 'Entrevista'}</h1>
            <StatusBadge status={interview.status} />
          </div>
          <p className="view-head__sub">{meta.description}</p>
        </div>
      </div>

      {rollbackNotice !== null && (
        <p className="detail__rollback" role="alert">
          <Icon name="alert" />
          <span>{rollbackNotice}</span>
        </p>
      )}

      <section className="card" aria-label="Dados da entrevista">
        <dl className="detail__meta">
          <Field label="ID" value={<code className="mono">{interview.id}</code>} />
          <Field label="Vaga" value={interview.job_id ?? '—'} />
          <Field
            label="ID externo"
            value={
              interview.external_id ? (
                <code className="mono">{interview.external_id}</code>
              ) : (
                'não informado'
              )
            }
          />
          <Field
            label="Gravação"
            value={<code className="mono detail__path">{interview.recording_url}</code>}
          />
          <Field
            label="Criada em"
            value={`${formatDateTime(interview.created_at)} (${formatRelative(
              interview.created_at,
              source.now(),
            )})`}
          />
          <Field
            label="Última atualização"
            value={`${formatDateTime(interview.updated_at)} (há ${formatDuration(
              source.now() - parseTimestamp(interview.updated_at).getTime(),
            )})`}
          />
          <Field label="Tentativas de reprocessamento" value={String(interview.retry_count)} />
        </dl>
      </section>

      {interview.status === 'falhou' && (
        <FailurePanel
          errorLog={interview.error_log}
          retryCount={interview.retry_count}
          onReprocess={handleReprocess}
        />
      )}

      <section className="card" aria-labelledby="decisao-title">
        <h2 id="decisao-title" className="card__title">
          Decisão
        </h2>
        <div className="card__body">
          <DecisionActions
            status={interview.status}
            candidateName={interview.scorecard?.candidate_name ?? null}
            flaggedCount={flaggedCount}
            onDecide={handleDecide}
          />
          {audit === null ? (
            <Gap gap="decisionAuthor" title="Autoria da decisão" variant="inline" />
          ) : (
            <AuditTrail entries={audit} now={source.now()} />
          )}
        </div>
      </section>

      {interview.scorecard !== null ? (
        <Scorecard
          scorecard={interview.scorecard}
          jobId={interview.job_id}
          transcript={transcriptText}
          onLocateQuote={onLocateQuote}
        />
      ) : (
        <section className="card">
          <p className="detail__pending">
            {statusMeta(interview.status).category === 'processing'
              ? 'Scorecard ainda não gerado — o processamento está em andamento.'
              : 'Nenhum scorecard disponível para esta entrevista.'}
          </p>
        </section>
      )}

      <section className="card" aria-labelledby="transcricao-title" ref={transcriptRef}>
        <h2 id="transcricao-title" className="card__title">
          Transcrição
        </h2>
        <div className="card__body">
          <Transcript
            transcription={interview.transcription_raw}
            diarization={interview.diarization_raw}
            highlightQuote={highlightQuote}
            onClearHighlight={() => setHighlightQuote(null)}
          />
        </div>
      </section>

      <DeliveryHistory interviewId={id} hasScorecard={interview.scorecard !== null} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="detail__field">
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
      <p className="detail__audit-empty">
        Nenhuma decisão registrada ainda nesta demonstração.
      </p>
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
            {entry.detail !== undefined && (
              <span className="audit__detail">{entry.detail}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
