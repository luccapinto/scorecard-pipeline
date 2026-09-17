import type { Interview } from '../../api/types';
import { INTERVIEW_STATUSES } from '../../api/types';
import type { StatusFilter } from '../../lib/status';
import { countByStatus, countNeedsAction, statusMeta } from '../../lib/status';

interface Props {
  interviews: Interview[];
  active: StatusFilter;
  onSelect: (filter: StatusFilter) => void;
}

// Pipeline overview: a clickable count per stage plus "Todas" and a highlighted
// "Precisa de ação" tile. Doubles as the status filter for the list below.
export function PipelineSummary({ interviews, active, onSelect }: Props) {
  const counts = countByStatus(interviews);
  const needsAction = countNeedsAction(interviews);

  return (
    <nav className="pipeline" aria-label="Resumo da esteira por estágio">
      <ul className="pipeline__tiles">
        <li>
          <FilterTile
            label="Todas"
            count={interviews.length}
            category="all"
            selected={active === 'all'}
            onClick={() => onSelect('all')}
          />
        </li>
        <li>
          <FilterTile
            label="Precisa de ação"
            count={needsAction}
            category="action"
            selected={active === 'action_required'}
            onClick={() => onSelect('action_required')}
            emphasize={needsAction > 0}
          />
        </li>
        {INTERVIEW_STATUSES.map((status) => {
          const meta = statusMeta(status);
          return (
            <li key={status}>
              <FilterTile
                label={meta.label}
                count={counts[status]}
                category={meta.category}
                selected={active === status}
                onClick={() => onSelect(status)}
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
}

function FilterTile({ label, count, category, selected, onClick, emphasize }: TileProps) {
  return (
    <button
      type="button"
      className={`tile tile--${category} ${selected ? 'tile--selected' : ''} ${
        emphasize ? 'tile--emphasize' : ''
      }`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className="tile__count">{count}</span>
      <span className="tile__label">{label}</span>
    </button>
  );
}
