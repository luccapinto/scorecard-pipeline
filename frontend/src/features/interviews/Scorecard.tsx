import type { CompetencyEvaluation, Scorecard as ScorecardData } from '../../api/types';
import { EvidenceBadge } from './EvidenceBadge';

interface Props {
  scorecard: ScorecardData;
}

const RECOMMENDATION_CLASS: Record<string, string> = {
  Aprovado: 'recommendation--approved',
  Rejeitado: 'recommendation--rejected',
  'Próxima Etapa': 'recommendation--next',
};

// Renders the LLM-produced scorecard: candidate, overall recommendation, and
// one card per competency (score 1..5, justification, evidence quote + the
// verification flag). Defensive against a malformed `evaluations` payload.
export function Scorecard({ scorecard }: Props) {
  const evaluations: CompetencyEvaluation[] = Array.isArray(scorecard.evaluations)
    ? scorecard.evaluations
    : [];

  const unverifiedCount = evaluations.filter((e) => e.evidence_verified === false).length;

  return (
    <section className="scorecard" aria-label="Scorecard da entrevista">
      <header className="scorecard__header">
        <div>
          <h2 className="scorecard__title">Scorecard</h2>
          <p className="scorecard__candidate">
            Candidato(a): <strong>{scorecard.candidate_name}</strong>
          </p>
        </div>
        <span
          className={`recommendation ${RECOMMENDATION_CLASS[scorecard.overall_recommendation] ?? ''}`}
        >
          {scorecard.overall_recommendation}
        </span>
      </header>

      {unverifiedCount > 0 && (
        <div className="scorecard__alert" role="alert">
          <strong>Atenção:</strong> {unverifiedCount}{' '}
          {unverifiedCount === 1 ? 'competência tem evidência' : 'competências têm evidências'} não
          verificada(s). Revise as citações destacadas antes de decidir.
        </div>
      )}

      {evaluations.length === 0 ? (
        <p className="scorecard__empty">Nenhuma competência avaliada neste scorecard.</p>
      ) : (
        <ol className="scorecard__list">
          {evaluations.map((evaluation, index) => (
            <li
              key={`${evaluation.competency_name}-${index}`}
              className={`competency ${
                evaluation.evidence_verified === false ? 'competency--flagged' : ''
              }`}
            >
              <div className="competency__head">
                <h3 className="competency__name">{evaluation.competency_name}</h3>
                <ScoreDots score={evaluation.score} />
              </div>
              <p className="competency__justification">{evaluation.justification}</p>
              <figure className="competency__evidence">
                <blockquote className="competency__quote">"{evaluation.evidence_quote}"</blockquote>
                <figcaption>
                  <EvidenceBadge verified={evaluation.evidence_verified} />
                </figcaption>
              </figure>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ScoreDots({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(5, Math.round(score)));
  return (
    <span className="score" aria-label={`Nota ${score} de 5`}>
      <span className="score__value">{score}</span>
      <span className="score__scale" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={`score__dot ${n <= clamped ? 'score__dot--on' : ''}`} />
        ))}
      </span>
      <span className="score__max" aria-hidden="true">
        / 5
      </span>
    </span>
  );
}
