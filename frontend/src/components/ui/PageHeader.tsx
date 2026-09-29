interface Props {
  /** Small label above the title: where this screen sits. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /**
   * One line, required: what the visitor is looking at and why it matters.
   * Every screen explains itself here — never in a wall of text below.
   */
  lede: React.ReactNode;
  /** Primary action(s) for the screen. */
  actions?: React.ReactNode;
  /** Status marks next to the title. */
  badges?: React.ReactNode;
}

export function PageHeader({ eyebrow, title, lede, actions, badges }: Props) {
  return (
    <header className="page-head">
      <div className="page-head__text">
        {eyebrow !== undefined && <p className="page-head__eyebrow">{eyebrow}</p>}
        <div className="page-head__title">
          <h1>{title}</h1>
          {badges}
        </div>
        <p className="page-head__lede">{lede}</p>
      </div>
      {actions !== undefined && <div className="page-head__actions">{actions}</div>}
    </header>
  );
}
