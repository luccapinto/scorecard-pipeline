import { useState } from 'react';

import { errorMessage } from '../../api/errors';
import type { DecisionAction, InterviewStatus } from '../../api/types';

interface Props {
  status: InterviewStatus;
  // Returns a promise so this component can show submitting/error state. The
  // caller performs the actual API call and refreshes the interview.
  onDecide: (action: DecisionAction) => Promise<void>;
}

const LABEL: Record<DecisionAction, string> = {
  approve: 'Aprovar',
  reject: 'Rejeitar',
};

// Approve/Reject controls. Enabled only in aguardando_aprovacao (a career
// decision must not be an accidental click), with an explicit confirmation
// step and inline handling of the backend's 400 for an invalid status.
export function DecisionActions({ status, onDecide }: Props) {
  const [pending, setPending] = useState<DecisionAction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDecide = status === 'aguardando_aprovacao';

  if (!canDecide) {
    return (
      <p className="decision decision--disabled">
        A decisão só fica disponível quando a entrevista está{' '}
        <strong>aguardando aprovação</strong>.
      </p>
    );
  }

  const confirm = async () => {
    if (!pending) return;
    setSubmitting(true);
    setError(null);
    try {
      await onDecide(pending);
      setPending(null);
    } catch (err) {
      // Surfaces the API's `detail` (e.g. the invalid-status 400 message).
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="decision">
      {error && (
        <p className="decision__error" role="alert">
          {error}
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
            {LABEL.reject}
          </button>
        </div>
      ) : (
        <div className="decision__confirm" role="group" aria-label="Confirmar decisão">
          <p className="decision__confirm-text">
            Confirmar <strong>{LABEL[pending].toLowerCase()}</strong> esta entrevista? Esta ação
            registra uma decisão sobre a candidatura.
          </p>
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
