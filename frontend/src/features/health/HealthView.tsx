// Observability screen.
//
// The point of this screen is that the app tells the truth about itself: what
// the API just answered, what the last request cost, whether the poll loop is
// actually running. It is also the only place that documents the error
// taxonomy, so a reader can see that every failure path was designed rather
// than caught.

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Health } from '../../api/types';
import type { RequestSample } from '../../api/telemetry';
import { lastRequest, subscribeRequests } from '../../api/telemetry';
import { Icon } from '../../components/ui/Icon';
import type { IconName } from '../../components/ui/Icon';
import { Skeleton, SkeletonGroup } from '../../components/ui/Skeleton';
import { loadConfig } from '../../config/settings';
import { useInterviews } from '../../data/InterviewsProvider';
import { useDataSource } from '../../data/source';
import { formatDateTime, formatLatency, formatRelative } from '../../lib/format';
import type { Diagnosis } from './errorTaxonomy';
import { ERROR_KIND_REFERENCE, diagnose, diagnoseUnhealthy } from './errorTaxonomy';

type HealthState =
  | { kind: 'loading' }
  | { kind: 'loaded'; health: Health }
  | { kind: 'failed'; diagnosis: Diagnosis };

type Tone = 'ok' | 'warn' | 'danger';

// Status is carried by icon + word + colour together. Colour alone would fail
// for the ~8% of men with a colour vision deficiency, and for anyone reading a
// printed screenshot.
function StatusLine({ tone, icon, text }: { tone: Tone; icon: IconName; text: string }) {
  return (
    <p className={`health-status health-status--${tone}`}>
      <Icon name={icon} className="health-status__icon" />
      <span>{text}</span>
    </p>
  );
}

function DiagnosisBlock({ diagnosis }: { diagnosis: Diagnosis }) {
  return (
    <div className="health-diagnosis">
      <StatusLine tone="danger" icon="alert" text={diagnosis.title} />
      <p className="health-diagnosis__text">{diagnosis.explanation}</p>
      <p className="health-diagnosis__next">
        <strong>O que fazer:</strong> {diagnosis.nextStep}
      </p>
    </div>
  );
}

export function HealthView() {
  const source = useDataSource();
  const { polling, lastLoadedAt, refreshing } = useInterviews();

  const [state, setState] = useState<HealthState>({ kind: 'loading' });
  const [checking, setChecking] = useState(false);
  // Monotonic token: a slow first check must never overwrite a newer manual one.
  const runId = useRef(0);

  const check = useCallback(() => {
    const id = ++runId.current;
    setChecking(true);
    source
      .getHealth()
      .then((health) => {
        if (runId.current !== id) return;
        setState({ kind: 'loaded', health });
      })
      .catch((error: unknown) => {
        if (runId.current !== id) return;
        // The base URL is read here only to make the offline/CORS split
        // possible; the rest of the config (the key) is never touched.
        setState({ kind: 'failed', diagnosis: diagnose(error, { baseUrl: loadConfig().baseUrl }) });
      })
      .finally(() => {
        if (runId.current !== id) return;
        setChecking(false);
      });
  }, [source]);

  useEffect(() => {
    check();
  }, [check]);

  const [sample, setSample] = useState<RequestSample | null>(() => lastRequest());
  useEffect(() => {
    // Re-read on mount: a request may have settled before this screen existed.
    setSample(lastRequest());
    return subscribeRequests(setSample);
  }, []);

  const intervalSeconds = Math.round(polling.intervalMs / 100) / 10;
  const loadedIso = lastLoadedAt === null ? null : new Date(lastLoadedAt).toISOString();

  return (
    <>
      <div className="view-head">
        <div className="view-head__text">
          <h1 className="view-head__title">Saúde e observabilidade</h1>
          <p className="view-head__sub">
            O que a API respondeu, quanto custou a última requisição e como a atualização automática
            está se comportando.
          </p>
        </div>
        <div className="view-head__actions">
          <button type="button" className="btn btn--primary" onClick={check} disabled={checking}>
            <Icon name="rotate" />
            {checking ? 'Verificando…' : 'Verificar agora'}
          </button>
        </div>
      </div>

      <section className="card" aria-labelledby="health-api">
        <h2 className="card__title" id="health-api">
          Estado da API
        </h2>
        <div className="card__body">
          {state.kind === 'loading' && (
            <SkeletonGroup label="Verificando o estado da API">
              <Skeleton width="12rem" height="1.25rem" />
              <Skeleton width="20rem" />
            </SkeletonGroup>
          )}

          {state.kind === 'loaded' && state.health.status === 'ok' && (
            <>
              <StatusLine tone="ok" icon="check" text="Operacional (status: ok)" />
              <p className="health-note">
                A API respondeu 200 em <code className="mono">/health</code> e todas as dependências
                declaradas estão de pé.
              </p>
            </>
          )}

          {state.kind === 'loaded' && state.health.status === 'unhealthy' && (
            <UnhealthyBlock problems={state.health.problems} />
          )}

          {state.kind === 'failed' && <DiagnosisBlock diagnosis={state.diagnosis} />}
        </div>
      </section>

      <section className="card" aria-labelledby="health-request">
        <h2 className="card__title" id="health-request">
          Última requisição
        </h2>
        <div className="card__body">
          {sample === null ? (
            <p className="health-note">Nenhuma requisição registrada nesta sessão.</p>
          ) : (
            <dl className="health-grid">
              <div className="data-row">
                <dt className="data-row__label">Método e caminho</dt>
                <dd className="data-row__value mono">
                  {sample.method} {sample.path}
                </dd>
              </div>
              <div className="data-row">
                <dt className="data-row__label">Status HTTP</dt>
                <dd className="data-row__value">
                  {sample.status === null ? (
                    <span className="health-status health-status--danger">
                      <Icon name="alert" className="health-status__icon" />
                      <span>Sem resposta — a requisição não chegou ao servidor</span>
                    </span>
                  ) : (
                    <span className="mono">{sample.status}</span>
                  )}
                </dd>
              </div>
              <div className="data-row">
                <dt className="data-row__label">Duração</dt>
                <dd className="data-row__value mono">{formatLatency(sample.durationMs)}</dd>
              </div>
              <div className="data-row">
                <dt className="data-row__label">Quando</dt>
                <dd className="data-row__value">
                  {formatDateTime(new Date(sample.at).toISOString())}
                </dd>
              </div>
            </dl>
          )}
          <p className="health-note">
            Por decisão de projeto, apenas o caminho é registrado. Cabeçalhos, query string e a
            chave de API nunca são guardados nem exibidos aqui.
          </p>
        </div>
      </section>

      <section className="card" aria-labelledby="health-polling">
        <h2 className="card__title" id="health-polling">
          Atualização automática
        </h2>
        <div className="card__body">
          {source.mode === 'demo' ? (
            <p className="health-note">
              No modo demonstração não há atualização automática: os dados vêm de um cenário local
              com relógio próprio, sem nenhuma requisição de rede.
            </p>
          ) : (
            <dl className="health-grid">
              <div className="data-row">
                <dt className="data-row__label">Estado</dt>
                <dd className="data-row__value">
                  {polling.enabled ? (
                    <StatusLine tone="ok" icon="pulse" text="Ativa" />
                  ) : (
                    <StatusLine tone="warn" icon="alert" text="Pausada" />
                  )}
                </dd>
              </div>
              <div className="data-row">
                <dt className="data-row__label">Intervalo</dt>
                <dd className="data-row__value">{intervalSeconds} s</dd>
              </div>
              <div className="data-row">
                <dt className="data-row__label">Aba oculta</dt>
                <dd className="data-row__value">
                  {polling.pausedByVisibility
                    ? 'Sim — a atualização fica suspensa enquanto a aba não está visível'
                    : 'Não'}
                </dd>
              </div>
              <div className="data-row">
                <dt className="data-row__label">Última carga</dt>
                <dd className="data-row__value">
                  {loadedIso === null
                    ? '—'
                    : `${formatDateTime(loadedIso)} (${formatRelative(loadedIso, source.now())})`}
                </dd>
              </div>
              <div className="data-row">
                <dt className="data-row__label">Buscando agora</dt>
                <dd className="data-row__value">{refreshing ? 'Sim' : 'Não'}</dd>
              </div>
            </dl>
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="health-taxonomy">
        <h2 className="card__title" id="health-taxonomy">
          Taxonomia de erros
        </h2>
        <div className="card__body">
          <div className="health-table-wrap">
            <table className="health-table">
              <caption>
                Cada falha possível é classificada em uma destas categorias, com uma ação
                correspondente. Nenhuma delas exibe a chave de API.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Significado</th>
                  <th scope="col">O que fazer</th>
                </tr>
              </thead>
              <tbody>
                {ERROR_KIND_REFERENCE.map((entry) => (
                  <tr key={entry.kind}>
                    <td className="mono">{entry.kind}</td>
                    <td>{entry.title}</td>
                    <td>{entry.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

function UnhealthyBlock({ problems }: { problems: Record<string, string> }) {
  const diagnosis = diagnoseUnhealthy(problems);
  const entries = Object.entries(problems);

  return (
    <>
      <StatusLine tone="warn" icon="alert" text={diagnosis.title} />
      <p className="health-diagnosis__text">{diagnosis.explanation}</p>
      <ul className="health-problems">
        {entries.map(([key, code]) => (
          <li className="health-problem" key={key}>
            <span className="health-problem__key mono">{key}</span>
            <Icon name="arrowRight" className="health-problem__arrow" />
            <span className="health-problem__code mono">{code}</span>
          </li>
        ))}
      </ul>
      <p className="health-diagnosis__next">
        <strong>O que fazer:</strong> {diagnosis.nextStep}
      </p>
    </>
  );
}
