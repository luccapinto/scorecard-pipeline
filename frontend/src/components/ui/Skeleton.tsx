// Loading placeholders.
//
// A skeleton is only honest where the layout is genuinely predictable — a list
// of rows, a card with known slots. Where it is not (an arbitrary error, an
// unknown-length transcript) a spinner tells the truth better than a fake
// shape. Callers pick; this module just draws.
//
// The whole group is one `aria-busy` region with a single label, so a screen
// reader hears "carregando entrevistas" once instead of eight empty boxes.

interface SkeletonProps {
  /** Width as a CSS length or percentage. */
  width?: string;
  height?: string;
  className?: string;
}

export function Skeleton({ width = '100%', height = '1rem', className }: SkeletonProps) {
  return (
    <span
      className={`skeleton ${className ?? ''}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

interface GroupProps {
  label: string;
  children: React.ReactNode;
}

export function SkeletonGroup({ label, children }: GroupProps) {
  return (
    <div className="skeleton-group" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function SkeletonRows({ rows = 5, label }: { rows?: number; label: string }) {
  return (
    <SkeletonGroup label={label}>
      <ul className="skeleton-rows">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="skeleton-rows__item">
            <Skeleton width="38%" height="0.95rem" />
            <Skeleton width="22%" height="0.8rem" />
            <Skeleton width="15%" height="1.4rem" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

export function SkeletonCards({ cards = 4, label }: { cards?: number; label: string }) {
  return (
    <SkeletonGroup label={label}>
      <div className="skeleton-cards">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="skeleton-cards__item">
            <Skeleton width="45%" height="0.75rem" />
            <Skeleton width="60%" height="1.6rem" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}
