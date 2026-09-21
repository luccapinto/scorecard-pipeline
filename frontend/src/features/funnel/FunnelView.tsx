import { useId } from 'react';

import type { Route } from '../../app/routes';
import { Gap } from '../../components/ui/Gap';
import { Icon } from '../../components/ui/Icon';
import { useDataSource } from '../../data/source';
import { hrefFor } from '../../hooks/useHashRoute';
import { formatDuration, formatScore } from '../../lib/format';
import type { FunnelCard, FunnelStage } from '../../data/source';

interface Props {
  route: Route;
}

/**
 * Candidate funnel — a board, with no drag and drop.
 *
 * Accessible drag and drop is not a keyboard fallback bolted onto a mouse
 * gesture; done properly it is a second, parallel interaction model with its
 * own focus management and live announcements, and done improperly it is a
 * feature only some people can use. A per-card "move to" select is one native
 * control that every input method already drives correctly, so that is what
 * this uses. The board layout stays; only the gesture is dropped.
 */
export function FunnelView({ route }: Props) {
  const source = useDataSource();

  if (!source.capabilities.funnelStages || source.funnel === undefined) {
    return (
      <div className="funnel">
        <div className="view-head">
          <div className="view-head__text">
            <h1>Funil de candidatos</h1>
          </div>
        </div>
        <Gap gap="funnelStages" title="Funil não existe na API" />
      </div>
    );
  }

  const board = source.funnel();
  const now = source.now();

  return (
    <div className="funnel">
      <div className="view-head">
        <div className="view-head__text">
          <div className="view-head__title">
            <h1>Funil de candidatos</h1>
            <span className="pill pill--synthetic">fases sintéticas</span>
          </div>
          <p className="view-head__sub">
            Como esta camada de avaliação se encaixa num processo seletivo.
          </p>
        </div>
      </div>

      <p className="banner banner--warn">
        <Icon name="alert" />
        <span>
          <strong>Estas fases não existem no backend.</strong> A API tem apenas o{' '}
          <code className="mono">status</code> de <em>processamento</em> de uma entrevista
          (recebida → … → aprovada), que não é a fase de um candidato num processo seletivo. O
          quadro abaixo é uma encenação de como a camada se encaixaria num ATS.
        </span>
      </p>

      <div className="board">
        {board.stages.map((stage) => (
          <Column
            key={stage.id}
            stage={stage}
            stages={board.stages}
            cards={board.cards.filter((card) => card.stageId === stage.id)}
            route={route}
            now={now}
            onMove={(interviewId, stageId) => source.moveFunnelCard?.(interviewId, stageId)}
          />
        ))}
      </div>
    </div>
  );
}

interface ColumnProps {
  stage: FunnelStage;
  stages: FunnelStage[];
  cards: FunnelCard[];
  route: Route;
  now: number;
  onMove: (interviewId: string, stageId: string) => void;
}

function Column({ stage, stages, cards, route, now, onMove }: ColumnProps) {
  return (
    <section className="board__column" aria-labelledby={`fase-${stage.id}`}>
      <header className="board__head">
        <h2 id={`fase-${stage.id}`} className="board__title">
          {stage.label}
          <span className="board__count">{cards.length}</span>
        </h2>
        <p className="board__desc">{stage.description}</p>
      </header>

      {cards.length === 0 ? (
        <p className="board__empty">Nenhum candidato nesta fase.</p>
      ) : (
        <ul className="board__cards">
          {cards.map((card) => (
            <CandidateCard
              key={card.interviewId}
              card={card}
              stages={stages}
              route={route}
              now={now}
              onMove={onMove}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CandidateCard({
  card,
  stages,
  route,
  now,
  onMove,
}: {
  card: FunnelCard;
  stages: FunnelStage[];
  route: Route;
  now: number;
  onMove: (interviewId: string, stageId: string) => void;
}) {
  const selectId = useId();

  return (
    <li className={`fcard ${card.evidenceAlert ? 'fcard--flagged' : ''}`}>
      <a
        className="fcard__name"
        href={hrefFor({
          mode: route.mode,
          name: 'interview',
          id: card.interviewId,
          clockAnchor: route.clockAnchor,
        })}
      >
        {card.candidateName}
      </a>
      <p className="fcard__job">{card.jobTitle}</p>

      <div className="fcard__signals">
        <span className="chip chip--muted">
          {card.averageScore === null ? 'sem nota' : `média ${formatScore(card.averageScore)}`}
        </span>
        {card.evidenceAlert && (
          <span className="chip chip--danger">
            <Icon name="alert" />
            evidência
          </span>
        )}
      </div>

      <p className="fcard__age">há {formatDuration(now - card.enteredStageAt)} nesta fase</p>

      <div className="fcard__move">
        <label htmlFor={selectId} className="sr-only">
          Mover {card.candidateName} para outra fase
        </label>
        <select
          id={selectId}
          value={card.stageId}
          onChange={(event) => onMove(card.interviewId, event.target.value)}
        >
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              Mover para: {stage.label}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}
