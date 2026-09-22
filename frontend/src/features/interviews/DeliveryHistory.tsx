import { Gap } from '../../components/ui/Gap';
import { Icon } from '../../components/ui/Icon';
import { useDataSource } from '../../data/source';
import { formatDateTime, formatRelative } from '../../lib/format';

interface Props {
  interviewId: string;
  hasScorecard: boolean;
}

const CHANNEL_LABEL: Record<string, string> = {
  slack: 'Slack',
  webhook: 'Webhook genérico',
};

/**
 * Notification delivery log.
 *
 * The API dispatches Slack and webhook calls from `app/notifications.py` and
 * stores nothing about them — no table, no endpoint. So in API mode this is a
 * declared absence, not an empty table that implies "nothing was sent".
 */
export function DeliveryHistory({ interviewId, hasScorecard }: Props) {
  const source = useDataSource();

  if (!source.capabilities.deliveryHistory) {
    return (
      <section className="card" aria-labelledby="entrega-title">
        <h2 id="entrega-title" className="card__title">
          Entrega de notificações
        </h2>
        <div className="card__body">
          <Gap gap="deliveryHistory" title="Histórico não armazenado" />
        </div>
      </section>
    );
  }

  const attempts = source.deliveryHistory?.(interviewId) ?? [];

  return (
    <section className="card" aria-labelledby="entrega-title">
      <h2 id="entrega-title" className="card__title">
        Entrega de notificações
        <span className="pill pill--synthetic">sintética</span>
      </h2>
      <div className="card__body">
        {attempts.length === 0 ? (
          <p className="muted">
            {hasScorecard
              ? 'Nenhuma tentativa de entrega registrada nesta demonstração.'
              : 'A notificação só é disparada quando o scorecard fica pronto.'}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">
                Tentativas de entrega da notificação desta entrevista
              </caption>
            <thead>
              <tr>
                <th scope="col">Canal</th>
                <th scope="col">Tentativa</th>
                <th scope="col">Quando</th>
                <th scope="col">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <th scope="row">{CHANNEL_LABEL[attempt.channel] ?? attempt.channel}</th>
                  <td>{attempt.attempt}ª</td>
                  <td>
                    <span title={formatDateTime(new Date(attempt.at).toISOString())}>
                      {formatRelative(new Date(attempt.at).toISOString(), source.now())}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`delivery ${attempt.ok ? 'delivery--ok' : 'delivery--fail'}`}
                    >
                      <Icon name={attempt.ok ? 'check' : 'alert'} />
                      {attempt.ok ? 'Entregue' : 'Falhou'} — {attempt.detail}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
