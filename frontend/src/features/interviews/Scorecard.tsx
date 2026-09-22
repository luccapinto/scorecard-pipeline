import { useState } from 'react';

import type { CompetencyEvaluation, Scorecard as ScorecardData } from '../../api/types';
import { Gap } from '../../components/ui/Gap';
import { Icon } from '../../components/ui/Icon';
import { useDataSource } from '../../data/source';
import { formatScore } from '../../lib/format';
import { EvidenceBadge } from './EvidenceBadge';

interface Props {
  scorecard: ScorecardData;
  jobId: string | null;
  /** Consolidated transcript, for verifying quotes in place. */
  transcript: string | null;
  onLocateQuote: (quote: string) => void;
}

const RECOMMENDATION_CLASS: Record<string, string> = {
  Aprovado: 'recommendation--approved',
  Rejeitado: 'recommendation--rejected',
  'Próxima Etapa': 'recommendation--next',
};

export function Scorecard({ scorecard, jobId, transcript, onLocateQuote }: Props) {
  const evaluations: CompetencyEvaluation[] = Array.isArray(scorecard.evaluations)
    ? scorecard.evaluations
    : [];

  const flagged = evaluations.filter((item) => item.evidence_verified === false).length;

  return (
    <section className="scorecard" aria-labelledby="scorecard-title">
      <header className="scorecard__header">
        <div>
          <h2 id="scorecard-title" className="scorecard__title">
            Scorecard
          </h2>
          <p className="scorecard__candidate">
            Candidato(a): <strong>{scorecard.candidate_name}</strong>
          </p>
        </div>
        <span
          className={`recommendation ${
            RECOMMENDATION_CLASS[scorecard.overall_recommendation] ?? ''
          }`}
        >
          Recomendação do modelo: {scorecard.overall_recommendation}
        </span>
      </header>

      {flagged > 0 && (
        <div className="scorecard__alert" role="alert">
          <Icon name="alert" size="1.2rem" />
          <span>
            <strong>
              {flagged === 1
                ? '1 competência tem evidência não verificada'
                : `${flagged} competências têm evidência não verificada`}
              .
            </strong>{' '}
            A citação usada para justificar a nota não foi encontrada na transcrição. Revise antes
            de decidir.
          </span>
        </div>
      )}

      {evaluations.length === 0 ? (
        <p className="scorecard__empty">Nenhuma competência avaliada neste scorecard.</p>
      ) : (
        <ol className="scorecard__list">
          {evaluations.map((evaluation, index) => (
            <CompetencyCard
              key={`${evaluation.competency_name}-${index}`}
              evaluation={evaluation}
              jobId={jobId}
              transcript={transcript}
              onLocateQuote={onLocateQuote}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

interface CardProps {
  evaluation: CompetencyEvaluation;
  jobId: string | null;
  transcript: string | null;
  onLocateQuote: (quote: string) => void;
}

function CompetencyCard({ evaluation, jobId, transcript, onLocateQuote }: CardProps) {
  const source = useDataSource();
  const [scaleOpen, setScaleOpen] = useState(false);

  // A 1-5 number means nothing without its behavioural anchor. The anchors
  // live in data/synthetic/competency_*.json, which no endpoint serves — so
  // the real API cannot show them and says so instead of inventing text.
  const reference = source.capabilities.barsLevels
    ? (source.barsFor?.(jobId, evaluation.competency_name) ?? null)
    : null;
  const anchor = reference?.levels.find((level) => level.score === Math.round(evaluation.score));

  return (
    <li className={`competency ${evaluation.evidence_verified === false ? 'competency--flagged' : ''}`}>
      <div className="competency__head">
        <h3 className="competency__name">{evaluation.competency_name}</h3>
        <ScoreMeter score={evaluation.score} />
      </div>

      {reference !== null && <p className="competency__description">{reference.description}</p>}

      <div className="competency__bars">
        {anchor !== undefined ? (
          <>
            <p className="competency__anchor">
              <span className="competency__anchor-label">
                Nível {anchor.score} na escala BARS:
              </span>{' '}
              {anchor.text}
            </p>
            <button
              type="button"
              className="link-button"
              aria-expanded={scaleOpen}
              onClick={() => setScaleOpen((open) => !open)}
            >
              {scaleOpen ? 'Ocultar escala completa' : 'Ver escala completa (1 a 5)'}
            </button>
            {scaleOpen && reference !== null && (
              <ol className="bars-scale">
                {reference.levels.map((level) => (
                  <li
                    key={level.score}
                    className={`bars-scale__level ${
                      level.score === Math.round(evaluation.score) ? 'is-current' : ''
                    }`}
                  >
                    <span className="bars-scale__score">{level.score}</span>
                    <span className="bars-scale__text">{level.text}</span>
                    {level.score === Math.round(evaluation.score) && (
                      <span className="sr-only">(nível atribuído)</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : (
          <Gap gap="barsLevels" variant="inline" />
        )}
      </div>

      <p className="competency__justification">{evaluation.justification}</p>

      <figure className="competency__evidence">
        <blockquote className="competency__quote">
          <Icon name="quote" className="competency__quote-mark" />
          <span>{evaluation.evidence_quote}</span>
        </blockquote>
        <figcaption>
          <EvidenceBadge
            verified={evaluation.evidence_verified}
            quote={evaluation.evidence_quote}
            transcript={transcript}
            onLocate={() => onLocateQuote(evaluation.evidence_quote)}
          />
        </figcaption>
      </figure>
    </li>
  );
}

function ScoreMeter({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(5, Math.round(score)));
  return (
    <span className="score" aria-label={`Nota ${formatScore(score)} de 5`}>
      <span className="score__value">{formatScore(score)}</span>
      <span className="score__max">/5</span>
      <span className="score__scale" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((step) => (
          <span key={step} className={`score__dot ${step <= clamped ? 'score__dot--on' : ''}`} />
        ))}
      </span>
    </span>
  );
}
