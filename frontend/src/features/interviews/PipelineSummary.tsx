import { INTERVIEW_STATUSES } from '../../api/types';
import type { InterviewSummary } from '../../lib/projection';
import type { StatusFilter } from '../../lib/status';
import { statusMeta } from '../../lib/status';

interface Props {
  summaries: InterviewSummary[];
  active: StatusFilter;
  onSelect: (filter: StatusFilter) => void;
}

// Per-stage counts that double as the list filter. Kept from the original
// dashboard because it already worked: the tiles are the fastest way to answer
// "where is everything?" and "what needs me?" in one glance.
export function PipelineSummary({ summaries, active, onSelect }: Props) {
  const counts = Object.fromEntries(INTERVIEW_STATUSES.map((status) => [status, 0])) as Record<
    string,
    number
  >;
  let needsAction = 0;
  for (const summary of summaries) {
    if (summary.status in counts) counts[summary.status] += 1;
    if (summary.needsAction) needsAction += 1;
  }

  return (
    <nav className="pipeline" aria-label="Filtrar por estágio da esteira">
      <ul className="pipeline__tiles">
        <li>
          <Tile
            label="Todas"
            count={summaries.length}
            category="all"
            selected={active === 'all'}
            onClick={() => onSelect('all')}
          />
        </li>
        <li>
          <Tile
            label="Precisa de ação"
            count={needsAction}
            category="action_required"
            selected={active === 'action_required'}
            onClick={() => onSelect('action_required')}
            emphasize={needsAction > 0}
          />
        </li>
        {INTERVIEW_STATUSES.map((status) => {
          const meta = statusMeta(status);
          return (
            <li key={status}>
              <Tile
                label={meta.label}
                count={counts[status]}
                category={meta.category}
                selected={active === status}
                onClick={() => onSelect(status)}
                description={meta.description}
              />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

interface TileProps {
  label: string;
  count: number;
  category: string;
  selected: boolean;
  onClick: () => void;
  emphasize?: boolean;
  description?: string;
}

function Tile({
  label,
  count,
  category,
  selected,
  onClick,
  emphasize,
  description,
}: TileProps) {
  return (
    <button
      type="button"
      className={`tile tile--${category} ${selected ? 'is-selected' : ''} ${
        emphasize ? 'is-emphasized' : ''
      }`}
      onClick={onClick}
      aria-pressed={selected}
      title={description}
    >
      <span className="tile__count">{count}</span>
      <span className="tile__label">{label}</span>
    </button>
  );
}
