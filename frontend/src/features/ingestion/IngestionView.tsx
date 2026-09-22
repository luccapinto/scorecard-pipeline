import { useCallback, useEffect, useId, useState } from 'react';

import { AuthError, errorMessage } from '../../api/errors';
import type { CreateInterviewResponse, Job, Recording } from '../../api/types';
import type { Route } from '../../app/routes';
import { ErrorState } from '../../components/ErrorState';
import { Icon } from '../../components/ui/Icon';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { useInterviews } from '../../data/InterviewsProvider';
import { useDataSource } from '../../data/source';
import { hrefFor } from '../../hooks/useHashRoute';
import { WebhookInspector } from './WebhookInspector';

interface Props {
  route: Route;
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'hmac' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; response: CreateInterviewResponse };

export function IngestionView({ route }: Props) {
  const source = useDataSource();
  const { reload } = useInterviews();

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
    Promise.all([source.listJobs(), source.listRecordings()])
      .then(([jobList, recordingList]) => {
        setJobs(jobList);
        setRecordings(recordingList);
      })
      .catch((cause) => setOptionsError(cause));
  }, [source]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const payload = {
    recording_url: recordingUrl,
    job_id: jobId,
    external_id: externalId.trim() ? externalId.trim() : null,
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!jobId || !recordingUrl) return;
    setSubmit({ kind: 'submitting' });
    source
      .createInterview(payload)
      .then((response) => {
        setSubmit({ kind: 'done', response });
        reload();
      })
      .catch((cause) => {
        // The webhook is guarded by HMAC, not by X-API-Key. A browser cannot
        // sign without holding WEBHOOK_HMAC_SECRET, and putting that secret in
        // the bundle would publish it — so a 401 here is an expected outcome
        // to explain, never a failure to retry.
        if (cause instanceof AuthError) setSubmit({ kind: 'hmac' });
        else setSubmit({ kind: 'error', message: errorMessage(cause) });
      });
  };

  if (optionsError !== null) {
    return <ErrorState error={optionsError} onRetry={loadOptions} route={route} />;
  }

  if (jobs === null || recordings === null) {
    return <SkeletonRows rows={4} label="Carregando vagas e gravações…" />;
  }

  return (
    <div className="ingestion">
      <div className="view-head">
        <div className="view-head__text">
          <h1>Nova entrevista</h1>
          <p className="view-head__sub">
            Dispara o mesmo webhook de ingestão que o sistema de gravação usa. A API responde{' '}
            <strong>202 Accepted</strong>: aceite do pedido, não conclusão do processamento.
          </p>
        </div>
      </div>

      {submit.kind === 'hmac' && (
        <section className="card banner-card banner-card--warn" role="alert">
          <h2 className="card__title">
            <Icon name="alert" />
            Ingestão protegida por HMAC
          </h2>
          <div className="card__body">
            <p>
              Este servidor exige uma assinatura HMAC-SHA256 no cabeçalho{' '}
              <code className="mono">X-Webhook-Signature</code>. Um navegador não consegue assiná-la
              sem receber o segredo <code className="mono">WEBHOOK_HMAC_SECRET</code>, e embutir
              esse segredo no bundle o tornaria público para qualquer visitante.
            </p>
            <p>
              Por isso a criação pela interface não é possível aqui, e{' '}
              <strong>não deve ser</strong>: a entrevista precisa partir do sistema de gravação,
              que assina a requisição no servidor dele.
            </p>
          </div>
        </section>
      )}

      {submit.kind === 'done' ? (
        <Accepted
          response={submit.response}
          route={route}
          onAnother={() => {
            setSubmit({ kind: 'idle' });
            setRecordingUrl('');
            setExternalId('');
          }}
        />
      ) : (
        <div className="ingestion__grid">
          <section className="card">
            <h2 className="card__title">Dados da ingestão</h2>
            <div className="card__body">
              {submit.kind === 'error' && (
                <p className="banner banner--danger" role="alert">
                  <Icon name="alert" />
                  {submit.message}
                </p>
              )}

              <form className="form" onSubmit={onSubmit}>
                <div className="field">
                  <label htmlFor={jobFieldId}>Vaga</label>
                  <select
                    id={jobFieldId}
                    value={jobId}
                    required
                    onChange={(event) => setJobId(event.target.value)}
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
                    <p className="field__hint">
                      Nenhuma vaga encontrada. O servidor lê <code className="mono">job_*.json</code>{' '}
                      de <code className="mono">JOBS_DIR</code>.
                    </p>
                  )}
                </div>

                <div className="field">
                  <label htmlFor={recFieldId}>Gravação</label>
                  <select
                    id={recFieldId}
                    value={recordingUrl}
                    required
                    onChange={(event) => setRecordingUrl(event.target.value)}
                  >
                    <option value="" disabled>
                      Selecione uma gravação
                    </option>
                    {recordings.map((recording) => (
                      <option key={recording.path} value={recording.path}>
                        {recording.filename}
                      </option>
                    ))}
                  </select>
                  {recordings.length === 0 && (
                    <p className="field__hint">
                      Nenhuma gravação encontrada — normal num clone novo. Os arquivos{' '}
                      <code className="mono">.wav</code> são gerados por{' '}
                      <code className="mono">scripts/generate_synthetic.py</code>.
                    </p>
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
                    onChange={(event) => setExternalId(event.target.value)}
                    placeholder="Chave de idempotência do sistema de gravação"
                  />
                  <p className="field__hint">
                    Reenviar o mesmo valor devolve a entrevista existente em vez de criar uma
                    duplicata.
                  </p>
                </div>

                <div className="form__actions">
                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={submit.kind === 'submitting' || !jobId || !recordingUrl}
                  >
                    {submit.kind === 'submitting' ? 'Enviando…' : 'Disparar webhook'}
                  </button>
                  <a
                    className="btn btn--ghost"
                    href={hrefFor({
                      mode: route.mode,
                      name: 'interviews',
                      clockAnchor: route.clockAnchor,
                    })}
                  >
                    Cancelar
                  </a>
                </div>
              </form>
            </div>
          </section>

          <WebhookInspector payload={payload} />
        </div>
      )}
    </div>
  );
}

function Accepted({
  response,
  route,
  onAnother,
}: {
  response: CreateInterviewResponse;
  route: Route;
  onAnother: () => void;
}) {
  const deduplicated = response.deduplicated === true;

  return (
    <section
      className={`card banner-card ${deduplicated ? 'banner-card--info' : 'banner-card--ok'}`}
      role="status"
    >
      <h2 className="card__title">
        <Icon name={deduplicated ? 'copy' : 'check'} />
        {deduplicated ? 'Requisição deduplicada' : '202 Accepted'}
      </h2>
      <div className="card__body">
        {deduplicated ? (
          <p>
            Este <code className="mono">external_id</code> já existia. A API devolveu a entrevista{' '}
            <code className="mono">{response.interview_id}</code> com{' '}
            <code className="mono">deduplicated: true</code> e{' '}
            <strong>nada novo foi criado</strong> — é assim que o reenvio de um webhook não gera
            candidatura duplicada.
          </p>
        ) : (
          <p>
            A entrevista <code className="mono">{response.interview_id}</code> foi registrada com
            status <code className="mono">{response.status}</code>. O{' '}
            <strong>202 é um aceite</strong>: o processamento roda de forma assíncrona num worker
            e a esteira vai avançando o status.
          </p>
        )}

        <div className="form__actions">
          <a
            className="btn btn--primary"
            href={hrefFor({
              mode: route.mode,
              name: 'interview',
              id: response.interview_id,
              clockAnchor: route.clockAnchor,
            })}
          >
            Abrir entrevista
            <Icon name="arrowRight" />
          </a>
          <button type="button" className="btn btn--ghost" onClick={onAnother}>
            Disparar outra
          </button>
        </div>
      </div>
    </section>
  );
}
