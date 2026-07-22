import type { InterviewStatus } from '../api/types';
import { statusMeta } from '../lib/status';

interface Props {
  status: InterviewStatus;
}

// Colored pill for a status. The category drives the CSS class so
// action-required states read visually distinct from processing/done.
export function StatusBadge({ status }: Props) {
  const meta = statusMeta(status);
  return (
    <span
      className={`badge badge--${meta.category}`}
      data-status={status}
      title={meta.description}
    >
      {meta.category === 'processing' && (
        <span className="badge__pulse" aria-hidden="true" />
      )}
      {meta.label}
    </span>
  );
}
