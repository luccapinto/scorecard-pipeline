import { useState } from 'react';

import { errorMessage } from '../../api/errors';
import type { DecisionAction, InterviewStatus } from '../../api/types';
import { Icon } from '../../components/ui/Icon';

export interface DecisionActionsProps {
  status: InterviewStatus;
  /** Named in the confirmation, so nobody decides on the wrong person. */
  candidateName: string | null;
  /** Shown in the confirmation when the scorecard has flagged evidence. */
  flaggedCount: number;
  onDecide: (action: DecisionAction) => Promise<void>;
}

const LABEL: Record<DecisionAction, string> = {
  approve: 'Aprovar',
  reject: 'Rejeitar',
};

// Approve/Reject, enabled only in aguardando_aprovacao.
//
// Two steps, always, and never a bulk action: this writes a decision about a
// person's application. The confirmation names the candidate and the action in
// full, and repeats the evidence warning if any citation is unverified —
// because the one moment that matters is the instant before the click.
export function DecisionActions({
  status,
  candidateName,
  flaggedCount,
  onDecide,
}: DecisionActionsProps) {
  const [pending, setPending] = useState<DecisionAction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== 'aguardando_aprovacao') {
    return (
      <p className="decision decision--disabled">
        <Icon name="question" />
        <span>
          A decisão só fica disponível quando a entrevista está{' '}
          <strong>aguardando aprovação</strong>.
        </span>
      </p>
    );
  }

  const confirm = async () => {
    if (pending === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await onDecide(pending);
      setPending(null);
    } catch (cause) {
      // Surfaces the API's own `detail`. The 400 here is the real concurrency
      // case: another reviewer decided this interview while it was open.
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const who = candidateName ?? 'esta candidatura';

  return (
    <div className="decision">
      {error !== null && (
        <p className="decision__error" role="alert">
          <Icon name="alert" />
          <span>{error}</span>
        </p>
      )}

      {pending === null ? (
        <div className="decision__buttons">
          <button
            type="button"
            className="btn btn--approve"
            onClick={() => {
              setError(null);
              setPending('approve');
            }}
          >
            <Icon name="check" />
            {LABEL.approve}
          </button>
          <button
            type="button"
            className="btn btn--reject"
            onClick={() => {
              setError(null);
              setPending('reject');
            }}
          >
            <Icon name="close" />
            {LABEL.reject}
          </button>
        </div>
      ) : (
        <div className="decision__confirm" role="group" aria-label="Confirmar decisão">
          <p className="decision__confirm-text">
            Confirmar <strong>{LABEL[pending].toLowerCase()}</strong> a candidatura de{' '}
            <strong>{who}</strong>? Esta ação registra uma decisão sobre o processo seletivo de
            uma pessoa e não pode ser desfeita pela interface.
          </p>
          {flaggedCount > 0 && (
            <p className="decision__confirm-warning">
              <Icon name="alert" />
              <span>
                Atenção: {flaggedCount === 1 ? 'uma competência tem' : `${flaggedCount} competências têm`}{' '}
                evidência não verificada neste scorecard.
              </span>
            </p>
          )}
          <div className="decision__buttons">
            <button
              type="button"
              className={`btn ${pending === 'approve' ? 'btn--approve' : 'btn--reject'}`}
              onClick={confirm}
              disabled={submitting}
            >
              {submitting ? 'Enviando…' : `Confirmar ${LABEL[pending].toLowerCase()}`}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setPending(null)}
              disabled={submitting}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
