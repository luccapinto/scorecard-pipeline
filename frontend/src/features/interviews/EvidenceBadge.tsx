interface Props {
  verified: boolean | null;
}

// The single most important signal in the app. Three visually distinct states:
//
//  - true  -> verified: quote found in the transcript (calm, confirming).
//  - false -> NOT verified: the quote may be a model hallucination. This is a
//             loud, role="alert" warning — a person's career decision hangs on
//             whether the evidence is real, so it must not be a subtle icon.
//  - null  -> not automatically checked (neutral, distinct from false).
export function EvidenceBadge({ verified }: Props) {
  if (verified === true) {
    return (
      <p className="evidence-flag evidence-flag--verified">
        <span className="evidence-flag__icon" aria-hidden="true">
          ✓
        </span>
        <span>
          <strong>Evidência verificada.</strong> A citação foi localizada na transcrição.
        </span>
      </p>
    );
  }

  if (verified === false) {
    return (
      <div className="evidence-flag evidence-flag--unverified" role="alert">
        <span className="evidence-flag__icon" aria-hidden="true">
          ⚠
        </span>
        <div>
          <strong className="evidence-flag__headline">
            Evidência NÃO verificada — possível alucinação do modelo.
          </strong>
          <p className="evidence-flag__body">
            Esta citação não foi encontrada na transcrição. Ela pode ter sido inventada pelo
            modelo. Confirme manualmente na transcrição antes de considerar esta nota.
          </p>
        </div>
      </div>
    );
  }

  return (
    <p className="evidence-flag evidence-flag--unchecked">
      <span className="evidence-flag__icon" aria-hidden="true">
        ?
      </span>
      <span>
        Evidência <strong>não verificada automaticamente</strong>. Confirme na transcrição.
      </span>
    </p>
  );
}
