import type { CreateInterviewPayload } from '../../api/types';
import { Icon } from '../../components/ui/Icon';
import { useDataSource } from '../../data/source';
import { useDemoControls } from '../../data/demoControls';
import { formatDateTime } from '../../lib/format';

interface Props {
  payload: CreateInterviewPayload;
}

// Signature placeholder. Never a value, never a truncated value: the browser
// genuinely cannot compute this one, and showing a fake would misrepresent
// where the trust boundary is.
const SIGNATURE_PLACEHOLDER = 'sha256=«calculada pelo sistema de gravação, nunca pelo navegador»';

/**
 * Shows exactly what goes over the wire on ingestion: the request line, the
 * headers (with the HMAC signature redacted), the JSON body, and the last
 * response received.
 *
 * This is the screen that makes the ingestion contract legible — that the
 * webhook is signed server-side, that `external_id` is the idempotency key,
 * and that 202 means accepted rather than done.
 */
export function WebhookInspector({ payload }: Props) {
  const source = useDataSource();
  const controls = useDemoControls();
  const last = controls?.lastIngestion ?? null;

  const body = JSON.stringify(
    {
      recording_url: payload.recording_url || '<selecione uma gravação>',
      job_id: payload.job_id || '<selecione uma vaga>',
      ...(payload.external_id ? { external_id: payload.external_id } : {}),
    },
    null,
    2,
  );

  return (
    <section className="card inspector" aria-labelledby="inspector-title">
      <h2 id="inspector-title" className="card__title">
        <Icon name="plug" />O que é enviado
      </h2>
      <div className="card__body">
        <pre className="inspector__block">
          <code>{`POST /webhooks/recording HTTP/1.1
Content-Type: application/json
X-Webhook-Signature: ${SIGNATURE_PLACEHOLDER}

${body}`}</code>
        </pre>

        <ul className="inspector__notes">
          <li>
            <strong>Assinatura.</strong> O corpo é assinado com HMAC-SHA256 usando{' '}
            <code className="mono">WEBHOOK_HMAC_SECRET</code>. O valor real nunca aparece aqui, e o
            cliente nunca o calcula — seria publicar o segredo no bundle.
          </li>
          <li>
            <strong>Idempotência.</strong> Com <code className="mono">external_id</code>, um reenvio
            devolve a entrevista existente e{' '}
            <code className="mono">deduplicated: true</code>, em vez de criar outra.
          </li>
          <li>
            <strong>202 Accepted.</strong> A resposta confirma o registro, não o processamento: o
            trabalho é enfileirado no Redis e executado por um worker.
          </li>
        </ul>

        {last !== null && (
          <div className="inspector__response">
            <h3 className="inspector__subtitle">
              Última resposta
              {source.mode === 'demo' && <span className="pill pill--synthetic">sintética</span>}
            </h3>
            <p className="muted">{formatDateTime(new Date(last.at).toISOString())}</p>
            <pre className="inspector__block">
              <code>{`HTTP/1.1 ${last.httpStatus} Accepted

${JSON.stringify(last.response, null, 2)}`}</code>
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}
