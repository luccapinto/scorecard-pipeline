import { useMemo } from 'react';

import { closestPassage, locateQuote } from '../../lib/evidence';
import { Icon } from '../../components/ui/Icon';

interface Props {
  verified: boolean | null;
  /** The quote the model cited, used to search the transcript. */
  quote: string;
  /** Consolidated transcript text, or null when there is none yet. */
  transcript: string | null;
  /** Scrolls to and highlights the quote inside the transcript panel. */
  onLocate?: () => void;
}

// The single most important signal in the application.
//
// Three states, and they must be distinguishable without colour — a reviewer
// with deuteranopia, reading a greyscale print, or glancing at a screenshot
// has to reach the same conclusion. So each state differs in icon, in wording,
// in border weight and in how much space it takes. `false` is the only one
// that is loud, because it is the only one where a human might otherwise
// approve a career decision on a sentence nobody said.
export function EvidenceBadge({ verified, quote, transcript, onLocate }: Props) {
  // Only computed for the flagged case, and only when there is a transcript to
  // search: this is the evidence behind the alarm, not decoration.
  const nearest = useMemo(() => {
    if (verified !== false || !transcript) return null;
    return closestPassage(quote, transcript);
  }, [verified, quote, transcript]);

  const found = useMemo(() => {
    if (verified !== true || !transcript) return false;
    return locateQuote(quote, transcript) !== null;
  }, [verified, quote, transcript]);

  if (verified === false) {
    return (
      <div className="evidence evidence--alert" role="alert">
        <span className="evidence__icon" aria-hidden="true">
          <Icon name="alert" size="1.25rem" />
        </span>
        <div className="evidence__body">
          <p className="evidence__headline">
            Evidência NÃO verificada — possível alucinação do modelo.
          </p>
          <p className="evidence__text">
            A busca por esta citação na transcrição não encontrou nenhuma ocorrência. Ela pode ter
            sido inventada pelo modelo. <strong>Confirme na transcrição antes de considerar esta
            nota</strong> — ou desconsidere a competência.
          </p>
          {nearest !== null && (
            <p className="evidence__nearest">
              Trecho mais parecido encontrado ({nearest.similarity}% de semelhança):{' '}
              <q className="evidence__nearest-quote">
                {transcript!.slice(nearest.match.start, nearest.match.end)}
              </q>
            </p>
          )}
          {transcript === null && (
            <p className="evidence__text">
              Não há transcrição carregada para esta entrevista, então nem a comparação manual é
              possível aqui.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (verified === true) {
    return (
      <p className="evidence evidence--ok">
        <span className="evidence__icon" aria-hidden="true">
          <Icon name="check" />
        </span>
        <span className="evidence__body">
          <strong>Evidência verificada.</strong> A citação foi localizada na transcrição.
          {found && onLocate && (
            <>
              {' '}
              <button type="button" className="link-button" onClick={onLocate}>
                Ver na transcrição
              </button>
            </>
          )}
        </span>
      </p>
    );
  }

  return (
    <p className="evidence evidence--unchecked">
      <span className="evidence__icon" aria-hidden="true">
        <Icon name="question" />
      </span>
      <span className="evidence__body">
        <strong>Evidência não verificada automaticamente.</strong> O campo veio sem resultado de
        verificação — não é um alerta, é a ausência de uma checagem. Confirme na transcrição.
      </span>
    </p>
  );
}
