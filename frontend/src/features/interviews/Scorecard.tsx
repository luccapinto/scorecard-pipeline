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
  /** Link that highlights competency `index`'s citation in the transcript. */
  quoteHref: (index: number) => string;
  /** Competency whose citation is highlighted right now, if any. */
  activeQuote: number | null;
}

const RECOMMENDATION_CLASS: Record<string, string> = {
  Aprovado: 'recommendation--approved',
  Rejeitado: 'recommendation--rejected',
  'Próxima Etapa': 'recommendation--next',
};

export function Scorecard({ scorecard, jobId, transcript, quoteHref, activeQuote }: Props) {
  const evaluations: CompetencyEvaluation[] = Array.isArray(scorecard.evaluations)
    ? scorecard.evaluations
    : [];

  const flagged = evaluations.filter((item) => item.evidence_verified === false).length;
  const firstFlagged = evaluations.findIndex((item) => item.evidence_verified === false);

  return (
    <section className="scorecard" aria-labelledby="scorecard-title">
      <header className="scorecard__header">
        <h2 id="scorecard-title" className="scorecard__title">
          Scorecard
        </h2>
        <p className="scorecard__meta">
          Gerado pelo modelo para <strong>{scorecard.candidate_name}</strong>.{' '}
          <span
            className={`recommendation ${
              RECOMMENDATION_CLASS[scorecard.overall_recommendation] ?? ''
            }`}
          >
            Recomendação do modelo: {scorecard.overall_recommendation}
          </span>
        </p>
      </header>

      {flagged > 0 && (
        <p className="scorecard__alert" role="alert">
          <Icon name="alert" />
          <span>
            <strong>
              {flagged === 1
                ? '1 competência tem evidência não verificada'
                : `${flagged} competências têm evidência não verificada`}
              .
            </strong>{' '}
            A citação que justifica a nota não foi encontrada na transcrição. Revise antes de
            decidir.
          </span>
        </p>
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
              locateHref={quoteHref(index)}
              active={activeQuote === index}
              tour={index === 0 ? 'competency' : undefined}
              alarmTour={index === firstFlagged}
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
  locateHref: string;
  active: boolean;
  tour: string | undefined;
  alarmTour: boolean;
}

function CompetencyCard({
  evaluation,
  jobId,
  transcript,
  locateHref,
  active,
  tour,
  alarmTour,
}: CardProps) {
  const source = useDataSource();
  const [scaleOpen, setScaleOpen] = useState(false);

  // A 1-5 number means nothing without its behavioural anchor. The anchors
  // live in data/synthetic/competency_*.json, which no endpoint serves — so
  // the real API cannot show them and says so instead of inventing text.
  const reference = source.capabilities.barsLevels
    ? (source.barsFor?.(jobId, evaluation.competency_name) ?? null)
    : null;
  const rounded = Math.round(evaluation.score);
  const anchor = reference?.levels.find((level) => level.score === rounded);
  const state =
    evaluation.evidence_verified === false
      ? 'alert'
      : evaluation.evidence_verified === true
        ? 'ok'
        : 'unchecked';

  return (
    <li
      className={`competency ${evaluation.evidence_verified === false ? 'competency--flagged' : ''} ${
        active ? 'is-located' : ''
      }`}
      data-tour={tour}
    >
      <ScoreMeter score={evaluation.score} />

      <div className="competency__body">
        <h3 className="competency__name">{evaluation.competency_name}</h3>
        {reference !== null && <p className="competency__description">{reference.description}</p>}

        <div className="competency__bars">
          {anchor !== undefined ? (
            <>
              <p className="competency__anchor">
                <span className="competency__label">O que um {anchor.score} significa na rubrica</span>
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
                      className={`bars-scale__level ${level.score === rounded ? 'is-current' : ''}`}
                    >
                      <span className="bars-scale__score">{level.score}</span>
                      <span className="bars-scale__text">{level.text}</span>
                      {level.score === rounded && <span className="sr-only">(nível atribuído)</span>}
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <Gap gap="barsLevels" variant="inline" />
          )}
        </div>

        <p className="competency__justification">
          <span className="competency__label">Justificativa do modelo</span>
          {evaluation.justification}
        </p>

        <figure
          className={`quote quote--${state}`}
          data-tour={alarmTour ? 'evidence-alert' : undefined}
        >
          <blockquote className="quote__text">
            <p>{evaluation.evidence_quote}</p>
          </blockquote>
          <figcaption className="quote__verdict">
            <EvidenceBadge
              verified={evaluation.evidence_verified}
              quote={evaluation.evidence_quote}
              transcript={transcript}
              locateHref={locateHref}
            />
          </figcaption>
        </figure>
      </div>
    </li>
  );
}

function ScoreMeter({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(5, Math.round(score)));
  return (
    <p className="score" aria-label={`Nota ${formatScore(score)} de 5`}>
      <span className="score__value">{formatScore(score)}</span>
      <span className="score__max" aria-hidden="true">
        /5
      </span>
      <span className="score__scale" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((step) => (
          <span key={step} className={`score__step ${step <= clamped ? 'is-on' : ''}`} />
        ))}
      </span>
    </p>
  );
}
