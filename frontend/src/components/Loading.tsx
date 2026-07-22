interface Props {
  label?: string;
}

// Accessible busy indicator (announced to screen readers).
export function Loading({ label = 'Carregando…' }: Props) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="loading__spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

interface EmptyProps {
  title: string;
  hint?: string;
}

export function EmptyState({ title, hint }: EmptyProps) {
  return (
    <div className="empty-state">
      <p className="empty-state__title">{title}</p>
      {hint && <p className="empty-state__hint">{hint}</p>}
    </div>
  );
}
