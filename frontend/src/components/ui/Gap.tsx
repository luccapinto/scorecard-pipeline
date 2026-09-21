// The honest-empty component.
//
// This project's thesis is that a system which can hallucinate must be caught
// doing it. An interface for that system cannot itself invent a field. So
// wherever the real API has no answer, this renders the absence — with the
// one-line reason from API_GAPS and, where useful, a pointer to where the
// information actually lives.
//
// A field that is honestly empty with a one-line explanation is stronger, in a
// portfolio, than a field filled with fiction.

import type { GapKey } from '../../data/source';
import { API_GAPS } from '../../data/source';
import { Icon } from './Icon';

interface Props {
  gap: GapKey;
  /** Short heading; defaults to a neutral label. */
  title?: string;
  /** Optional call to action, e.g. a link to .env.example or the demo. */
  children?: React.ReactNode;
  /** `inline` for a field-level note, `block` for a whole panel. */
  variant?: 'inline' | 'block';
}

export function Gap({ gap, title = 'Não disponível nesta API', children, variant = 'block' }: Props) {
  if (variant === 'inline') {
    return (
      <p className="gap gap--inline">
        <Icon name="question" className="gap__icon" />
        <span>{API_GAPS[gap]}</span>
      </p>
    );
  }

  return (
    <div className="gap gap--block">
      <div className="gap__head">
        <Icon name="question" className="gap__icon" />
        <h3 className="gap__title">{title}</h3>
      </div>
      <p className="gap__body">{API_GAPS[gap]}</p>
      {children && <div className="gap__actions">{children}</div>}
    </div>
  );
}
