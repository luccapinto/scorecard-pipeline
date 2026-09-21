import { useCallback, useEffect, useMemo, useState } from 'react';

import type { IntegrationsStatus } from '../../api/types';
import type { Route } from '../../app/routes';
import { ErrorState } from '../../components/ErrorState';
import { Gap } from '../../components/ui/Gap';
import { Icon } from '../../components/ui/Icon';
import { SkeletonCards } from '../../components/ui/Skeleton';
import { useInterviews } from '../../data/InterviewsProvider';
import { useDataSource } from '../../data/source';
import { buildSlackPayload, buildWebhookPayload, TOKEN_PLACEHOLDER } from './blockKit';
import { SlackPreview } from './SlackPreview';

interface Props {
  route: Route;
  apiBaseUrl: string;
}

export function IntegrationsView({ route, apiBaseUrl }: Props) {
  const source = useDataSource();
  const { summaries, raw } = useInterviews();

  const [integrations, setIntegrations] = useState<IntegrationsStatus | null | undefined>(
    undefined,
  );
  const [error, setError] = useState<unknown>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    source
      .getIntegrations()
      .then((status) => setIntegrations(status))
      .catch((cause) => setError(cause));
  }, [source]);

  useEffect(() => {
    setIntegrations(undefined);
    load();
  }, [load]);

  // Preview the newest interview that actually has a scorecard: a preview of
  // an empty scorecard demonstrates nothing.
  const previewable = useMemo(
    () => (summaries ?? []).filter((summary) => summary.hasScorecard),
    [summaries],
  );
  const previewId = selectedId ?? previewable[0]?.id ?? null;
  const previewInterview = useMemo(
    () => (raw ?? []).find((interview) => interview.id === previewId) ?? null,
    [raw, previewId],
  );

  // The token exists server-side exactly while an interview awaits approval:
  // it is minted at PONTUANDO -> AGUARDANDO_APROVACAO and cleared on decision.
  const hasApprovalToken = previewInterview?.status === 'aguardando_aprovacao';

  const slackPayload = useMemo(
    () =>
      previewInterview?.scorecard == null
        ? null
        : buildSlackPayload({
            interviewId: previewInterview.id,
            scorecard: previewInterview.scorecard,
            apiBaseUrl,
            hasApprovalToken,
          }),
    [previewInterview, apiBaseUrl, hasApprovalToken],
  );

  if (error !== null) {
    return <ErrorState error={error} onRetry={load} route={route} baseUrl={apiBaseUrl} />;
  }

  return (
    <div className="integrations">
      <div className="view-head">
        <div className="view-head__text">
          <h1>Integrações e mensagens</h1>
          <p className="view-head__sub">
            Para onde o scorecard vai quando fica pronto, exatamente com que formato, e como a
            decisão volta para o sistema.
          </p>
        </div>
      </div>

      <section className="card" aria-labelledby="conexoes-title">
        <h2 id="conexoes-title" className="card__title">
          Conexões
        </h2>
        <div className="card__body">
          {integrations === undefined ? (
            <SkeletonCards cards={4} label="Consultando estado das integrações…" />
          ) : integrations === null ? (
            <Gap gap="integrations" title="Estado não exposto por esta API">
              <p className="muted">
                Esta tela mostra estado real quando o backend expõe{' '}
                <code className="mono">GET /integrations</code>. As variáveis que controlam cada
                integração estão documentadas em <code className="mono">.env.example</code>.
              </p>
            </Gap>
          ) : (
            <ConnectionGrid status={integrations} synthetic={source.mode === 'demo'} />
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="previa-title">
        <div className="card__header">
          <h2 id="previa-title" className="card__title">
            Prévia da notificação
          </h2>
          {previewable.length > 1 && (
            <label className="field-inline">
              <span>Entrevista</span>
              <select
                value={previewId ?? ''}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {previewable.map((summary) => (
                  <option key={summary.id} value={summary.id}>
                    {summary.candidateName ?? summary.id}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="card__body">
          <p className="card__lead">
            Reprodução da estrutura montada por{' '}
            <code className="mono">app/notifications.py::SlackNotification</code> — cabeçalho,
            campos de ID e recomendação, um bloco por competência com o marcador de verificação, e
            os botões de decisão.
          </p>

          {slackPayload === null ? (
            <p className="muted">
              Nenhuma entrevista com scorecard disponível para pré-visualizar.
            </p>
          ) : (
            <SlackPreview payload={slackPayload} hasApprovalToken={hasApprovalToken} />
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="links-title">
        <h2 id="links-title" className="card__title">
          Links de decisão
        </h2>
        <div className="card__body">
          <p className="card__lead">
            Os botões do Slack são links <code className="mono">url</code>, então abrem no
            navegador como <code className="mono">GET</code>. Eles apontam para o endpoint
            protegido por token de uso único:
          </p>
          <pre className="inspector__block">
            <code>{`GET /interviews/{interview_id}/decision?action=approve&token=${TOKEN_PLACEHOLDER}`}</code>
          </pre>
          <ul className="inspector__notes">
            <li>
              <strong>Uso único.</strong> O token é gerado quando o scorecard fica pronto
              (<code className="mono">secrets.token_urlsafe(32)</code>) e é apagado na primeira
              decisão — o segundo clique no mesmo link responde 401.
            </li>
            <li>
              <strong>Nunca exibido.</strong> O valor acima é um marcador, não uma redação
              cosmética: <code className="mono">serialize_interview</code> exclui{' '}
              <code className="mono">approval_token</code> de toda resposta da API, então esta
              interface não tem como obtê-lo — nem no modo demonstração.
            </li>
          </ul>

          {previewInterview?.scorecard != null && (
            <details className="raw-json">
              <summary>Ver payload do webhook genérico</summary>
              <pre className="inspector__block">
                <code>
                  {JSON.stringify(
                    buildWebhookPayload({
                      interviewId: previewInterview.id,
                      scorecard: previewInterview.scorecard,
                      apiBaseUrl,
                      hasApprovalToken,
                    }),
                    null,
                    2,
                  )}
                </code>
              </pre>
            </details>
          )}
        </div>
      </section>

      {!source.capabilities.deliveryHistory && (
        <section className="card" aria-labelledby="hist-title">
          <h2 id="hist-title" className="card__title">
            Histórico de entrega
          </h2>
          <div className="card__body">
            <Gap gap="deliveryHistory" title="Histórico não armazenado" />
          </div>
        </section>
      )}
    </div>
  );
}

interface Connection {
  key: string;
  label: string;
  detail: string;
  configured: boolean;
  offLabel: string;
}

function ConnectionGrid({
  status,
  synthetic,
}: {
  status: IntegrationsStatus;
  synthetic: boolean;
}) {
  const connections: Connection[] = [
    {
      key: 'slack',
      label: 'Slack',
      detail: 'Recebe o scorecard em Block Kit com os botões de decisão.',
      configured: status.slack.configured,
      offLabel: 'SLACK_WEBHOOK_URL vazio — notificação ignorada.',
    },
    {
      key: 'webhook',
      label: 'Webhook genérico',
      detail: 'Recebe o scorecard em JSON, para integrar com um ATS.',
      configured: status.webhook.configured,
      offLabel: 'NOTIFICATION_WEBHOOK_URL vazio — notificação ignorada.',
    },
    {
      key: 'transcription',
      label: `Transcrição · ${status.transcription.provider}`,
      detail:
        status.transcription.model === null
          ? 'Provider não reconhecido pelo backend.'
          : `Modelo ${status.transcription.model}.`,
      configured: status.transcription.configured,
      offLabel: 'Credencial do provider ausente — a esteira falha em TRANSCREVENDO.',
    },
    {
      key: 'scoring',
      label: `Scoring · ${status.scoring.provider}`,
      detail: `Modelo ${status.scoring.model ?? '—'}.`,
      configured: status.scoring.configured,
      offLabel: 'OPENROUTER_API_KEY vazio — a esteira falha em PONTUANDO.',
    },
    {
      key: 'hmac',
      label: 'Assinatura HMAC do webhook',
      detail: 'Exige X-Webhook-Signature na ingestão.',
      configured: status.webhook_hmac.enabled,
      offLabel: 'Desligado — qualquer origem pode criar entrevistas (só para dev).',
    },
    {
      key: 'apikey',
      label: 'Chave de API',
      detail: 'Exigida nos endpoints de leitura e de ação.',
      configured: status.api_key.enabled,
      offLabel: 'Desligada — endpoints abertos (só para dev).',
    },
  ];

  return (
    <>
      <p className="card__lead">
        {synthetic ? (
          <>
            Estado <strong>sintético</strong> desta demonstração.
          </>
        ) : (
          <>
            Estado real, lido de <code className="mono">GET /integrations</code>. O endpoint
            devolve apenas booleanos e nomes de provider/modelo — nenhum segredo, nem mascarado.
          </>
        )}
      </p>
      <ul className="connections">
        {connections.map((connection) => (
          <li
            key={connection.key}
            className={`connection ${connection.configured ? 'is-on' : 'is-off'}`}
          >
            <span className="connection__state">
              <Icon name={connection.configured ? 'check' : 'close'} />
              {connection.configured ? 'Configurado' : 'Não configurado'}
            </span>
            <span className="connection__label">{connection.label}</span>
            <span className="connection__detail">
              {connection.configured ? connection.detail : connection.offLabel}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
