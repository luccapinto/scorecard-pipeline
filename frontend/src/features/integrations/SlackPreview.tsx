import { useState } from 'react';

import { Icon } from '../../components/ui/Icon';
import type { Block, SlackPayload } from './blockKit';

interface Props {
  payload: SlackPayload;
  /** Shown when the backend would omit the action buttons. */
  hasApprovalToken: boolean;
}

/**
 * Renders the Block Kit payload the way Slack would, plus the raw JSON.
 *
 * Slack mrkdwn is rendered by splitting on `*bold*` and emitting React nodes —
 * never via `dangerouslySetInnerHTML`. The text inside carries a candidate's
 * transcribed words and an LLM's output; both are untrusted input.
 */
export function SlackPreview({ payload, hasApprovalToken }: Props) {
  const [showJson, setShowJson] = useState(false);

  return (
    <div className="slack">
      <div className="slack__toolbar">
        <span className="slack__app">
          <span className="slack__avatar" aria-hidden="true">
            SP
          </span>
          <span>
            <strong>Scorecard Pipeline</strong>
            <span className="slack__badge">APP</span>
          </span>
        </span>
        <button
          type="button"
          className="link-button"
          aria-expanded={showJson}
          onClick={() => setShowJson((open) => !open)}
        >
          {showJson ? 'Ver prévia renderizada' : 'Ver JSON bruto'}
        </button>
      </div>

      {showJson ? (
        <pre className="slack__json">
          <code>{JSON.stringify(payload, null, 2)}</code>
        </pre>
      ) : (
        <div className="slack__message">
          {payload.blocks.map((block, index) => (
            <BlockView key={index} block={block} />
          ))}
          {!hasApprovalToken && (
            <p className="slack__note">
              <Icon name="question" />
              <span>
                Sem token de aprovação ativo, o backend envia a mensagem{' '}
                <strong>sem os botões</strong> e registra um aviso no log — é o comportamento de{' '}
                <code className="mono">app/notifications.py</code>, reproduzido aqui.
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.type === 'header') {
    return <h4 className="slack__header">{block.text.text}</h4>;
  }

  if (block.type === 'divider') {
    return <hr className="slack__divider" />;
  }

  if (block.type === 'section') {
    if ('fields' in block) {
      return (
        <div className="slack__fields">
          {block.fields.map((field, index) => (
            <p key={index} className="slack__field">
              <Mrkdwn text={field.text} />
            </p>
          ))}
        </div>
      );
    }
    return (
      <p className="slack__section">
        <Mrkdwn text={block.text.text} />
      </p>
    );
  }

  return (
    <div className="slack__actions">
      {block.elements.map((element) => (
        <span
          key={element.action_id}
          className={`slack__button slack__button--${element.style ?? 'default'}`}
          // Not a real link: the URL carries a token placeholder and the
          // preview must never be clickable into a decision.
          title={element.url}
        >
          {element.text.text}
        </span>
      ))}
    </div>
  );
}

/** Minimal Slack mrkdwn: `*bold*` and newlines. Output is React nodes only. */
function Mrkdwn({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, lineIndex) => (
        <span key={lineIndex} className="slack__line">
          {line.split(/(\*[^*]+\*)/g).map((part, partIndex) =>
            part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
              <strong key={partIndex}>{part.slice(1, -1)}</strong>
            ) : (
              <span key={partIndex}>{part}</span>
            ),
          )}
        </span>
      ))}
    </>
  );
}
