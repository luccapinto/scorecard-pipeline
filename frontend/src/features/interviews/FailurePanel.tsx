import { useState } from 'react';

import { errorMessage } from '../../api/errors';
import { Icon } from '../../components/ui/Icon';

interface Props {
  /** Raw `error_log` — a full Python traceback, see app/tasks.py. */
  errorLog: string | null;
  retryCount: number;
  onReprocess: () => Promise<void>;
}

export interface TracebackSummary {
  /** The exception block: type, message and any continuation lines. */
  headline: string;
  /** The stack frames above it. */
  frames: string;
}

/**
 * Splits a Python traceback into the part that says WHAT broke and the part
 * that says WHERE.
 *
 * `error_log` is `traceback.format_exc()` (app/tasks.py::_record_failure):
 * dozens of lines of stack with the one useful sentence at the bottom.
 * Showing the raw blob is technically honest and practically useless.
 *
 * The split keys off the traceback's real structure — the exception block is
 * everything after the last `  File "..."` frame and its indented source
 * echo — rather than "the last unindented line". That distinction is not
 * academic: a Pydantic ValidationError, which is exactly what a bad scoring
 * response produces, puts its field errors on UNINDENTED continuation lines,
 * so the naive rule slices the message in half and buries the exception.
 */
export function summarizeTraceback(log: string): TracebackSummary {
  const lines = log.trimEnd().split('\n');

  let lastFrame = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s+File ["']/.test(lines[index])) lastFrame = index;
  }

  let start: number;
  if (lastFrame === -1) {
    // No frames at all: fall back to the last unindented, non-empty line.
    start = lines.length - 1;
    while (start > 0 && (lines[start].startsWith(' ') || lines[start].trim() === '')) {
      start -= 1;
    }
  } else {
    // Skip the frame's indented source echo; the exception block starts at
    // the first column-zero line after it.
    start = lastFrame + 1;
    while (start < lines.length && (lines[start].startsWith(' ') || lines[start].trim() === '')) {
      start += 1;
    }
    if (start >= lines.length) start = lastFrame + 1;
  }

  return {
    headline: lines.slice(start).join('\n').trim() || log.trim(),
    frames: lines.slice(0, start).join('\n').trimEnd(),
  };
}

export function FailurePanel({ errorLog, retryCount, onReprocess }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = errorLog === null ? null : summarizeTraceback(errorLog);

  const reprocess = async () => {
    setBusy(true);
    setError(null);
    try {
      await onReprocess();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="failure card" aria-labelledby="falha-title">
      <h2 id="falha-title" className="card__title failure__title">
        <Icon name="alert" />
        O processamento falhou
      </h2>

      <div className="card__body">
        <p className="failure__lead">
          A esteira parou nesta entrevista.{' '}
          {retryCount === 0
            ? 'Ainda não houve tentativa de reprocessamento.'
            : `Já ${retryCount === 1 ? 'houve 1 tentativa' : `houve ${retryCount} tentativas`} de reprocessamento.`}{' '}
          O reprocessamento retoma a partir do último checkpoint salvo, não do zero.
        </p>

        {summary === null ? (
          <p className="failure__none">Sem detalhes de erro registrados.</p>
        ) : (
          <>
            {/* Untrusted text: this is an exception message built from provider
                responses and audio paths, so it is rendered as text nodes. */}
            <pre className="failure__headline">{summary.headline}</pre>
            {summary.frames.length > 0 && (
              <>
                <button
                  type="button"
                  className="link-button"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((open) => !open)}
                >
                  {expanded ? 'Ocultar traceback completo' : 'Ver traceback completo'}
                </button>
                {expanded && <pre className="failure__frames">{summary.frames}</pre>}
              </>
            )}
          </>
        )}

        {error !== null && (
          <p className="failure__error" role="alert">
            {error}
          </p>
        )}

        <button type="button" className="btn btn--primary" onClick={reprocess} disabled={busy}>
          <Icon name="rotate" />
          {busy ? 'Reenfileirando…' : 'Reprocessar'}
        </button>
      </div>
    </section>
  );
}
