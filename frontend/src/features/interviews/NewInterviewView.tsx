import { useCallback, useEffect, useId, useState } from 'react';

import type { ApiConfig } from '../../api/client';
import { createInterview, listJobs, listRecordings } from '../../api/client';
import { AuthError, errorMessage } from '../../api/errors';
import type { CreateInterviewResponse, Job, Recording } from '../../api/types';
import { ErrorState } from '../../components/ErrorState';
import { Loading } from '../../components/Loading';

interface Props {
  config: ApiConfig;
  onCreated: (id: string) => void;
  onCancel: () => void;
  onOpenConfig: () => void;
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'hmac' } // 401/403 from the webhook: ingestion is HMAC-protected
  | { kind: 'error'; message: string }
  | { kind: 'done'; response: CreateInterviewResponse };

export function NewInterviewView({ config, onCreated, onCancel, onOpenConfig }: Props) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [recordings, setRecordings] = useState<Recording[] | null>(null);
  const [optionsError, setOptionsError] = useState<unknown>(null);

  const [jobId, setJobId] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const [externalId, setExternalId] = useState('');
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });

  const jobFieldId = useId();
  const recFieldId = useId();
  const extFieldId = useId();

  const loadOptions = useCallback(() => {
    setJobs(null);
    setRecordings(null);
    setOptionsError(null);
    Promise.all([listJobs(config), listRecordings(config)])
      .then(([jobList, recList]) => {
        setJobs(jobList);
        setRecordings(recList);
      })
      .catch((err) => setOptionsError(err));
  }, [config]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!jobId || !recordingUrl) return;
    setSubmit({ kind: 'submitting' });
    createInterview(config, {
      recording_url: recordingUrl,
      job_id: jobId,
      external_id: externalId.trim() ? externalId.trim() : null,
    })
      .then((response) => setSubmit({ kind: 'done', response }))
      .catch((err) => {
        // The webhook is guarded by HMAC (not X-API-Key). A browser can't sign
        // without leaking the secret, so a 401/403 here is expected when the
        // server has WEBHOOK_HMAC_SECRET set — explain, don't retry.
        if (err instanceof AuthError) {
          setSubmit({ kind: 'hmac' });
        } else {
          setSubmit({ kind: 'error', message: errorMessage(err) });
        }
      });
  };

  if (optionsError) {
    return (
      <div className="new-view">
        <h1 className="new-view__title">Nova entrevista</h1>
        <ErrorState error={optionsError} onRetry={loadOptions} onOpenConfig={onOpenConfig} />
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Voltar
        </button>
      </div>
    );
  }

  if (jobs === null || recordings === null) {
    return (
      <div className="new-view">
        <h1 className="new-view__title">Nova entrevista</h1>
        <Loading label="Carregando vagas e gravações…" />
      </div>
    );
  }

  if (submit.kind === 'done') {
    const { response } = submit;
    return (
      <div className="new-view">
        <h1 className="new-view__title">Entrevista criada</h1>
        <div className="new-view__success" role="status">
          <p>
            Entrevista <strong>{response.interview_id}</strong> registrada com status{' '}
            <strong>{response.status}</strong>.
          </p>
          {response.deduplicated && (
            <p className="new-view__dedup">
              Este <code>external_id</code> já existia: a entrevista existente foi retornada
              (idempotência), nada novo foi criado.
            </p>
          )}
        </div>
        <div className="new-view__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onCreated(response.interview_id)}
          >
            Abrir entrevista
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setSubmit({ kind: 'idle' });
              setRecordingUrl('');
              setExternalId('');
            }}
          >
            Criar outra
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="new-view">
      <h1 className="new-view__title">Nova entrevista</h1>

      {submit.kind === 'hmac' && (
        <div className="new-view__hmac" role="alert">
          <h2>Ingestão protegida por HMAC</h2>
          <p>
            Este servidor exige uma assinatura HMAC-SHA256 no webhook de ingestão. Um navegador não
            pode assinar sem expor o segredo, então a criação pela interface não é possível aqui. A
            entrevista deve ser enviada pelo sistema de gravação, que assina a requisição com o
            segredo compartilhado.
          </p>
        </div>
      )}

      {submit.kind === 'error' && (
        <p className="new-view__error" role="alert">
          {submit.message}
        </p>
      )}

      <form className="new-view__form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor={jobFieldId}>Vaga</label>
          <select
            id={jobFieldId}
            value={jobId}
            required
            onChange={(e) => setJobId(e.target.value)}
          >
            <option value="" disabled>
              Selecione uma vaga
            </option>
            {jobs.map((job) => (
              <option key={job.job_id} value={job.job_id}>
                {job.title} ({job.job_id})
              </option>
            ))}
          </select>
          {jobs.length === 0 && (
            <p className="field__hint">Nenhuma vaga encontrada no servidor.</p>
          )}
        </div>

        <div className="field">
          <label htmlFor={recFieldId}>Gravação</label>
          <select
            id={recFieldId}
            value={recordingUrl}
            required
            onChange={(e) => setRecordingUrl(e.target.value)}
          >
            <option value="" disabled>
              Selecione uma gravação
            </option>
            {recordings.map((rec) => (
              <option key={rec.path} value={rec.path}>
                {rec.filename}
              </option>
            ))}
          </select>
          {recordings.length === 0 && (
            <p className="field__hint">Nenhuma gravação de exemplo encontrada no servidor.</p>
          )}
        </div>

        <div className="field">
          <label htmlFor={extFieldId}>
            ID externo <span className="field__optional">(opcional)</span>
          </label>
          <input
            id={extFieldId}
            type="text"
            value={externalId}
            autoComplete="off"
            onChange={(e) => setExternalId(e.target.value)}
            placeholder="Chave de idempotência do sistema de gravação"
          />
          <p className="field__hint">
            Se informado, um reenvio com o mesmo valor retorna a entrevista existente.
          </p>
        </div>

        <div className="new-view__actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={submit.kind === 'submitting' || !jobId || !recordingUrl}
          >
            {submit.kind === 'submitting' ? 'Enviando…' : 'Criar entrevista'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
