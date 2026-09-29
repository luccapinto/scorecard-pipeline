// Observability screen.
//
// The point of this screen is that the app tells the truth about itself: what
// the API just answered, what the last request cost, whether the poll loop is
// actually running. It is also the only place that documents the error
// taxonomy, so a reader can see that every failure path was designed rather
// than caught.
//
// The showcase has no API, so it gets a different screen rather than a live
// one with nothing in it: what the real panel watches, and where in the code
// each part lives. The live panel is compiled out of that bundle.

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Health } from '../../api/types';
import { codeUrl } from '../../app/links';
import { SHOWCASE } from '../../app/edition';
import type { Route } from '../../app/routes';
import type { RequestSample } from '../../api/telemetry';
import { lastRequest, subscribeRequests } from '../../api/telemetry';
import { Icon } from '../../components/ui/Icon';
import type { IconName } from '../../components/ui/Icon';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton, SkeletonGroup } from '../../components/ui/Skeleton';
import { loadConfig } from '../../config/settings';
import { useInterviews } from '../../data/InterviewsProvider';
import { useDataSource } from '../../data/source';
import { formatDateTime, formatLatency, formatRelative } from '../../lib/format';
import { InsideNav } from '../inside/InsideNav';
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

export function HealthView({ route }: { route: Route }) {
  return (
    <div className="page">
      <InsideNav route={route} />
      {SHOWCASE ? <ShowcaseHealth /> : <LiveHealth />}
    </div>
  );
}

function LiveHealth() {
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

  const [sample, setSample] = useState<RequestSample | null>(null);

  // Telemetry lives in module scope and mode switching is a hash change with
  // no reload, so a sample taken in API mode would otherwise survive into the
  // demo screen and display a real backend request under the synthetic
  // banner. That is precisely the mode mixing ADR 0005 forbids.
  const showsRequests = source.mode === 'api';
  useEffect(() => {
    if (!showsRequests) return;
    setSample(lastRequest());
    return subscribeRequests(setSample);
  }, [showsRequests]);

  const intervalSeconds = Math.round(polling.intervalMs / 100) / 10;
  const loadedIso = lastLoadedAt === null ? null : new Date(lastLoadedAt).toISOString();

  return (
    <>
      <PageHeader
        eyebrow="Por dentro"
        title="Saúde e observabilidade"
        lede="A interface conta a verdade sobre si mesma: o que a API respondeu, quanto custou a última requisição e se a atualização automática está de fato rodando."
        actions={
          <button type="button" className="btn btn--primary" onClick={check} disabled={checking}>
            <Icon name="rotate" />
            {checking ? 'Verificando…' : 'Verificar agora'}
          </button>
        }
      />

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
              {source.mode === 'demo' ? (
                // Under the synthetic banner or not, claiming "the API
                // answered 200" when no request was made would be the one
                // fabricated statement in the whole interface. Say what
                // actually happened instead.
                <p className="health-note">
                  <strong>Estado simulado.</strong> Nenhuma requisição foi feita: no modo
                  demonstração este cartão mostra como um servidor saudável apareceria aqui.
                  Troque para o modo API para consultar o <code className="mono">/health</code>{' '}
                  de verdade.
                </p>
              ) : (
                <p className="health-note">
                  A API respondeu 200 em <code className="mono">/health</code> e todas as
                  dependências declaradas estão de pé.
                </p>
              )}
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
          {!showsRequests ? (
            <p className="health-note">
              <strong>Nenhuma requisição existe para mostrar.</strong> O modo demonstração não faz
              E/S de rede, então este cartão fica deliberadamente vazio aqui — inclusive se você
              usou o modo API nesta mesma aba.
            </p>
          ) : sample === null ? (
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

function ShowcaseHealth() {
  return (
    <>
      <PageHeader
        eyebrow="Por dentro"
        title="Saúde e observabilidade"
        lede="Com o backend no ar, esta tela mostra o que a API respondeu, quanto custou a última requisição e se a atualização automática está rodando. Aqui, sem backend, ela mostra o que é observado — e onde."
      />
      <div className="explain-grid">
        <section className="panel" aria-labelledby="obs-health">
          <h2 id="obs-health" className="panel__title">
            Saúde da API
          </h2>
          <p>
            <code>GET /health</code> testa de verdade o Postgres e o Redis e devolve o nome da
            dependência que falhou. A interface transforma isso em causa provável e próximo passo.
          </p>
          <a href={codeUrl('app/main.py')} target="_blank" rel="noreferrer noopener">
            app/main.py
          </a>
        </section>
        <section className="panel" aria-labelledby="obs-requests">
          <h2 id="obs-requests" className="panel__title">
            Última requisição
          </h2>
          <p>
            <strong>Nenhuma requisição existe para mostrar.</strong> A demonstração não faz E/S de
            rede: um teste percorre todas as telas com cada primitiva de rede trocada por um espião
            que falha, e exige zero chamadas.
          </p>
          <a
            href={codeUrl('frontend/src/demo/isolation.test.tsx')}
            target="_blank"
            rel="noreferrer noopener"
          >
            demo/isolation.test.tsx
          </a>
        </section>
        <section className="panel" aria-labelledby="obs-polling">
          <h2 id="obs-polling" className="panel__title">
            Atualização automática
          </h2>
          <p>
            Com backend, um único loop de polling serve o app inteiro: mais rápido enquanto há
            entrevista em processamento, mais lento quando nada se move, e pausado com a aba oculta.
            Aqui nada se move sozinho — só quando você simula.
          </p>
          <a
            href={codeUrl('frontend/src/data/InterviewsProvider.tsx')}
            target="_blank"
            rel="noreferrer noopener"
          >
            data/InterviewsProvider.tsx
          </a>
        </section>
        <section className="panel" aria-labelledby="obs-errors">
          <h2 id="obs-errors" className="panel__title">
            Falhas classificadas
          </h2>
          <p>
            Toda falha vira uma categoria com uma ação correspondente, em vez de uma mensagem
            genérica — e nenhuma delas exibe a chave de acesso. A classificação é pura e tem teste
            próprio.
          </p>
          <a
            href={codeUrl('frontend/src/features/health/errorTaxonomy.ts')}
            target="_blank"
            rel="noreferrer noopener"
          >
            health/errorTaxonomy.ts
          </a>
        </section>
      </div>
    </>
  );
}
