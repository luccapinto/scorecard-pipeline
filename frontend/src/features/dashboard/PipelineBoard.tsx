import type { InterviewStatus } from '../../api/types';
import type { Route } from '../../app/routes';
import { Icon } from '../../components/ui/Icon';
import { hrefFor } from '../../hooks/useHashRoute';
import type { InterviewSummary } from '../../lib/projection';

interface Stage {
  key: string;
  statuses: InterviewStatus[];
  label: string;
  /** What happens here, for someone who has never seen the backend. */
  what: string;
}

// The pipeline, left to right, exactly as app/models.py orders it. Scoring
// and evidence verification share a column because they share a state: the
// validator runs inside PONTUANDO, before the scorecard is ever saved.
const STAGES: Stage[] = [
  {
    key: 'recebida',
    statuses: ['recebida'],
    label: 'Recebida',
    what: 'A gravação chegou pelo webhook.',
  },
  {
    key: 'transcrevendo',
    statuses: ['transcrevendo'],
    label: 'Transcrição',
    what: 'O áudio vira texto.',
  },
  {
    key: 'diarizando',
    statuses: ['diarizando'],
    label: 'Diarização',
    what: 'Separa quem disse o quê.',
  },
  {
    key: 'pontuando',
    statuses: ['pontuando'],
    label: 'Pontuação',
    what: 'Um LLM avalia; cada citação é conferida.',
  },
  {
    key: 'aguardando_aprovacao',
    statuses: ['aguardando_aprovacao'],
    label: 'Decisão humana',
    what: 'Para aqui, até uma pessoa decidir.',
  },
  {
    key: 'decidida',
    statuses: ['aprovada', 'rejeitada'],
    label: 'Decididas',
    what: 'Aprovadas ou rejeitadas por alguém.',
  },
];

/** Cards shown per column before collapsing into "+N". */
const VISIBLE = 4;

interface Props {
  summaries: InterviewSummary[];
  route: Route;
  jobTitles: Record<string, string>;
  /** Interview the demo is walking through the pipeline, highlighted. */
  playingId: string | null;
  simulatedId: string | null;
}

export function PipelineBoard({ summaries, route, jobTitles, playingId, simulatedId }: Props) {
  const failed = summaries.filter((summary) => summary.status === 'falhou');

  return (
    <section className="board" aria-labelledby="board-title">
      <h2 id="board-title" className="sr-only">
        Entrevistas por etapa da esteira
      </h2>
      <ol className="board__stages" data-tour="pipeline">
        {STAGES.map((stage, index) => {
          const cards = summaries.filter((summary) => stage.statuses.includes(summary.status));
          // The newest simulation always stays visible, even in a full column.
          const pinned = cards.filter((card) => card.id === simulatedId);
          const rest = cards.filter((card) => card.id !== simulatedId);
          const shown = [...pinned, ...rest].slice(0, VISIBLE);
          const hidden = cards.length - shown.length;
          return (
            <li
              key={stage.key}
              className={`stage stage--${stage.key} ${cards.length === 0 ? 'is-empty' : ''}`}
              aria-labelledby={`stage-${stage.key}`}
            >
              <header className="stage__head">
                <span className="stage__num" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="stage__label" id={`stage-${stage.key}`}>
                  {stage.label}
                  <span className="stage__count">
                    {cards.length}
                    <span className="sr-only">
                      {cards.length === 1 ? ' entrevista' : ' entrevistas'}
                    </span>
                  </span>
                </h3>
                <p className="stage__what">{stage.what}</p>
              </header>
              {cards.length === 0 ? (
                <p className="stage__empty">Nenhuma agora.</p>
              ) : (
                <ul className="stage__cards">
                  {shown.map((summary) => (
                    <BoardCard
                      key={summary.id}
                      summary={summary}
                      route={route}
                      jobTitle={summary.jobId === null ? null : (jobTitles[summary.jobId] ?? summary.jobId)}
                      playing={summary.id === playingId}
                      fresh={summary.id === simulatedId}
                    />
                  ))}
                </ul>
              )}
              {hidden > 0 && (
                <a
                  className="stage__more"
                  href={hrefFor({ mode: route.mode, name: 'interviews', clockAnchor: route.clockAnchor })}
                >
                  + {hidden} {hidden === 1 ? 'outra' : 'outras'}
                </a>
              )}
            </li>
          );
        })}
      </ol>

      {failed.length > 0 && (
        <div className="board__failed">
          <Icon name="alert" />
          <p>
            <strong>{failed.length === 1 ? '1 falha' : `${failed.length} falhas`}</strong> no
            caminho — cada uma pode ser reprocessada a partir da etapa em que parou:
          </p>
          <ul className="board__failed-list">
            {failed.map((summary) => (
              <li key={summary.id}>
                <a
                  href={hrefFor({
                    mode: route.mode,
                    name: 'interview',
                    id: summary.id,
                    clockAnchor: route.clockAnchor,
                  })}
                >
                  {summary.jobId === null ? summary.id : (jobTitles[summary.jobId] ?? summary.jobId)}
                  <span className="mono"> · {summary.id}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

interface CardProps {
  summary: InterviewSummary;
  route: Route;
  jobTitle: string | null;
  playing: boolean;
  fresh: boolean;
}

function BoardCard({ summary, route, jobTitle, playing, fresh }: CardProps) {
  const named = summary.candidateName !== null;
  return (
    <li
      className={`bcard ${fresh ? 'bcard--fresh' : ''} ${playing ? 'is-playing' : ''} ${
        summary.hasEvidenceAlert ? 'bcard--alert' : ''
      }`}
      // One element glides between columns while a simulation plays; see
      // DemoProvider's view transition.
      style={playing ? { viewTransitionName: 'simulated-interview' } : undefined}
    >
      <a
        className="bcard__link"
        href={hrefFor({
          mode: route.mode,
          name: 'interview',
          id: summary.id,
          clockAnchor: route.clockAnchor,
        })}
      >
        {fresh && <span className="bcard__tag">Nova</span>}
        {/* Before scoring there is no name: it comes out of the scorecard.
            The job and the id keep early cards distinguishable instead of a
            column of identical placeholders. */}
        <span className="bcard__name">{named ? summary.candidateName : (jobTitle ?? 'Sem vaga')}</span>
        <span className={named ? 'bcard__job' : 'bcard__job bcard__job--id'}>
          {named ? (jobTitle ?? 'Sem vaga') : summary.id}
        </span>
        {summary.hasEvidenceAlert && (
          <span className="bcard__flag">
            <Icon name="alert" />
            {summary.evidence.unverified === 1
              ? '1 citação não encontrada'
              : `${summary.evidence.unverified} citações não encontradas`}
          </span>
        )}
        {summary.status === 'aprovada' && <span className="bcard__outcome">Aprovada</span>}
        {summary.status === 'rejeitada' && (
          <span className="bcard__outcome bcard__outcome--no">Rejeitada</span>
        )}
      </a>
    </li>
  );
}
