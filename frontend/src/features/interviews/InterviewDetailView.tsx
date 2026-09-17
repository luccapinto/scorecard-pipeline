import { useCallback, useEffect, useState } from 'react';

import type { ApiConfig } from '../../api/client';
import { decideInterview, getInterview, reprocessInterview } from '../../api/client';
import { errorMessage } from '../../api/errors';
import type { DecisionAction, Interview } from '../../api/types';
import { ErrorState } from '../../components/ErrorState';
import { Loading } from '../../components/Loading';
import { StatusBadge } from '../../components/StatusBadge';
import { usePolling } from '../../hooks/usePolling';
import { formatDateTime } from '../../lib/format';
import { statusMeta } from '../../lib/status';
import { DecisionActions } from './DecisionActions';
import { Scorecard } from './Scorecard';
import { Transcript } from './Transcript';

interface Props {
  config: ApiConfig;
  id: string;
  onBack: () => void;
  onOpenConfig: () => void;
}

export function InterviewDetailView({ config, id, onBack, onOpenConfig }: Props) {
  const [interview, setInterview] = useState<Interview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reprocessError, setReprocessError] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(false);

  const load = useCallback(() => {
    getInterview(config, id)
      .then((data) => {
        setInterview(data);
        setError(null);
      })
      .catch((err) => setError(err));
  }, [config, id]);

  useEffect(() => {
    setInterview(null);
    setError(null);
    load();
  }, [load]);

  // Poll while the interview is still being processed; stop once it settles.
  const isProcessing =
    interview !== null && statusMeta(interview.status).category === 'processing';
  usePolling(load, { intervalMs: 5000, enabled: isProcessing });

  const handleDecide = useCallback(
    async (action: DecisionAction): Promise<void> => {
      await decideInterview(config, id, action);
      // Refresh so the new terminal status and cleared token are reflected.
      load();
    },
    [config, id, load],
  );

  const handleReprocess = useCallback(() => {
    setReprocessing(true);
    setReprocessError(null);
    reprocessInterview(config, id)
      .then(() => load())
      .catch((err) => setReprocessError(errorMessage(err)))
      .finally(() => setReprocessing(false));
  }, [config, id, load]);

  if (error && interview === null) {
    return (
      <div className="detail-view">
        <BackButton onBack={onBack} />
        <ErrorState error={error} onRetry={load} onOpenConfig={onOpenConfig} />
      </div>
    );
  }

  if (interview === null) {
    return (
      <div className="detail-view">
        <BackButton onBack={onBack} />
        <Loading label="Carregando entrevista…" />
      </div>
    );
  }

  return (
    <div className="detail-view">
      <BackButton onBack={onBack} />

      <header className="detail-view__header">
        <div>
          <h1 className="detail-view__title">Entrevista</h1>
          <p className="detail-view__id">{interview.id}</p>
        </div>
        <StatusBadge status={interview.status} />
      </header>

      <dl className="detail-view__meta">
        <div>
          <dt>Vaga</dt>
          <dd>{interview.job_id ?? '—'}</dd>
        </div>
        <div>
          <dt>ID externo</dt>
          <dd>{interview.external_id ?? '—'}</dd>
        </div>
        <div>
          <dt>Gravação</dt>
          <dd className="detail-view__mono">{interview.recording_url}</dd>
        </div>
        <div>
          <dt>Criada em</dt>
          <dd>{formatDateTime(interview.created_at)}</dd>
        </div>
        <div>
          <dt>Atualizada em</dt>
          <dd>{formatDateTime(interview.updated_at)}</dd>
        </div>
        <div>
          <dt>Tentativas</dt>
          <dd>{interview.retry_count}</dd>
        </div>
      </dl>

      {interview.status === 'falhou' && (
        <section className="failure" aria-label="Falha no processamento">
          <h2 className="failure__title">O processamento falhou</h2>
          {interview.error_log ? (
            <pre className="failure__log">{interview.error_log}</pre>
          ) : (
            <p>Sem detalhes de erro registrados.</p>
          )}
          {reprocessError && (
            <p className="failure__error" role="alert">
              {reprocessError}
            </p>
          )}
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleReprocess}
            disabled={reprocessing}
          >
            {reprocessing ? 'Reenfileirando…' : 'Reprocessar'}
          </button>
        </section>
      )}

      <section className="detail-view__decision" aria-label="Decisão">
        <h2 className="detail-view__section-title">Decisão</h2>
        <DecisionActions status={interview.status} onDecide={handleDecide} />
      </section>

      <section className="detail-view__scorecard">
        {interview.scorecard ? (
          <Scorecard scorecard={interview.scorecard} />
        ) : (
          <p className="detail-view__pending">
            {statusMeta(interview.status).category === 'processing'
              ? 'Scorecard ainda não gerado — processamento em andamento.'
              : 'Nenhum scorecard disponível para esta entrevista.'}
          </p>
        )}
      </section>

      <section className="detail-view__transcript">
        <h2 className="detail-view__section-title">Transcrição</h2>
        <Transcript
          transcription={interview.transcription_raw}
          diarization={interview.diarization_raw}
        />
      </section>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="btn btn--ghost back-button" onClick={onBack}>
      <span aria-hidden="true">←</span> Voltar para a lista
    </button>
  );
}
