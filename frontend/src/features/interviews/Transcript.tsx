import { useEffect, useId, useMemo, useRef, useState } from 'react';

import type { RawTranscription, TranscriptSegment } from '../../api/types';
import { Icon } from '../../components/ui/Icon';
import { formatSeconds } from '../../lib/format';
import { locateQuote } from '../../lib/evidence';
import type { SpeakerTurn } from '../../lib/transcript';
import { buildTurns, speakerColorIndex } from '../../lib/transcript';

type SourceKind = 'diarization' | 'raw';

interface Props {
  transcription: RawTranscription;
  diarization: TranscriptSegment[] | null;
  /** Quote to find and highlight; set by clicking a citation in the scorecard. */
  highlightQuote: string | null;
  onClearHighlight: () => void;
}

export function Transcript({
  transcription,
  diarization,
  highlightQuote,
  onClearHighlight,
}: Props) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const hasDiarization = Array.isArray(diarization) && diarization.length > 0;
  const hasRaw = transcription !== null;
  const [kind, setKind] = useState<SourceKind>(hasDiarization ? 'diarization' : 'raw');

  const turns = useMemo<SpeakerTurn[]>(
    () =>
      kind === 'diarization' && hasDiarization
        ? buildTurns(null, diarization)
        : buildTurns(transcription, null),
    [kind, hasDiarization, diarization, transcription],
  );

  // Which turn contains the cited quote. Computed per turn rather than over
  // the concatenated text so the highlight lands on a real, scrollable node.
  const highlightIndex = useMemo(() => {
    if (highlightQuote === null) return -1;
    return turns.findIndex((turn) => locateQuote(highlightQuote, turn.text) !== null);
  }, [highlightQuote, turns]);

  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (highlightIndex < 0 || listRef.current === null) return;
    const node = listRef.current.children[highlightIndex];
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ block: 'center' });
      node.focus({ preventScroll: true });
    }
  }, [highlightIndex, highlightQuote]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return turns.map((turn, index) => ({ turn, index }));
    return turns
      .map((turn, index) => ({ turn, index }))
      .filter((entry) => entry.turn.text.toLowerCase().includes(needle));
  }, [turns, query]);

  if (turns.length === 0) {
    return (
      <p className="transcript__empty">
        Nenhuma transcrição disponível para esta entrevista ainda.
      </p>
    );
  }

  return (
    <div className="transcript">
      <div className="transcript__toolbar">
        {hasDiarization && hasRaw && (
          <div className="segmented" role="radiogroup" aria-label="Fonte da transcrição">
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'diarization'}
              className={`segmented__option ${kind === 'diarization' ? 'is-active' : ''}`}
              onClick={() => setKind('diarization')}
            >
              Diarização
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'raw'}
              className={`segmented__option ${kind === 'raw' ? 'is-active' : ''}`}
              onClick={() => setKind('raw')}
            >
              Transcrição bruta
            </button>
          </div>
        )}

        <div className="transcript__search">
          <label htmlFor={searchId} className="sr-only">
            Buscar na transcrição
          </label>
          <Icon name="search" className="transcript__search-icon" />
          <input
            id={searchId}
            type="search"
            value={query}
            placeholder="Buscar na transcrição…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <p className="transcript__count" role="status">
          {query.trim()
            ? `${visible.length} de ${turns.length} falas`
            : `${turns.length} falas`}
        </p>
      </div>

      {hasDiarization && hasRaw && (
        <p className="transcript__note">
          {kind === 'diarization'
            ? 'Diarização: mesma fala, separada por interlocutor. É esta versão que dá o contexto de quem disse o quê.'
            : 'Transcrição bruta: saída direta do provedor, antes da separação por interlocutor. É contra este texto que as citações são verificadas.'}
        </p>
      )}

      {highlightQuote !== null && (
        <div className="transcript__locator" role="status">
          {highlightIndex >= 0 ? (
            <>
              <Icon name="check" />
              <span>
                Citação localizada na fala {highlightIndex + 1}, destacada abaixo.
              </span>
            </>
          ) : (
            <>
              <Icon name="alert" />
              <span>
                Esta citação <strong>não foi encontrada</strong> em nenhuma fala desta
                transcrição.
              </span>
            </>
          )}
          <button type="button" className="link-button" onClick={onClearHighlight}>
            Limpar destaque
          </button>
        </div>
      )}

      {/* The turn list has a max-height and scrolls. A scrollable region that
          cannot receive focus is unreachable by keyboard: the content is
          simply lost to anyone not using a pointer (WCAG 2.1.1). tabIndex=0
          makes it a stop, and the label says what the stop is. */}
      <ol
        className="transcript__turns"
        ref={listRef}
        tabIndex={0}
        aria-label="Falas da transcrição, área rolável"
      >
        {visible.map(({ turn, index }) => (
          <li
            key={index}
            id={`fala-${index}`}
            tabIndex={-1}
            className={`turn ${index === highlightIndex ? 'turn--highlight' : ''}`}
            data-speaker={speakerColorIndex(turn.speaker)}
          >
            <div className="turn__meta">
              <span className="turn__speaker">{turn.speaker ?? 'Sem interlocutor'}</span>
              {turn.start !== null && (
                <span className="turn__time mono">{formatSeconds(turn.start)}</span>
              )}
            </div>
            <p className="turn__text">
              <Highlighted
                text={turn.text}
                quote={index === highlightIndex ? highlightQuote : null}
                query={query.trim()}
              />
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

interface HighlightProps {
  text: string;
  quote: string | null;
  query: string;
}

/**
 * Renders the turn with the cited passage marked. Text is split and rendered
 * as React children, never as HTML: a transcript comes from audio of a real
 * conversation and is untrusted input — `dangerouslySetInnerHTML` here would
 * be an injection sink fed by whatever a candidate said.
 */
function Highlighted({ text, quote, query }: HighlightProps) {
  if (quote !== null) {
    const match = locateQuote(quote, text);
    if (match !== null) {
      return (
        <>
          {text.slice(0, match.start)}
          <mark className="turn__mark">{text.slice(match.start, match.end)}</mark>
          {text.slice(match.end)}
        </>
      );
    }
  }

  if (query) {
    const at = text.toLowerCase().indexOf(query.toLowerCase());
    if (at !== -1) {
      return (
        <>
          {text.slice(0, at)}
          <mark className="turn__mark turn__mark--search">
            {text.slice(at, at + query.length)}
          </mark>
          {text.slice(at + query.length)}
        </>
      );
    }
  }

  return <>{text}</>;
}
