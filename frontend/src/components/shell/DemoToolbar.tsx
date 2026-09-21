import { useDemoControls } from '../../data/demoControls';
import { Icon } from '../ui/Icon';

/**
 * The demo's clock control.
 *
 * Nothing in demo mode moves on a timer. Time advances only when this button
 * is pressed, which is what keeps the dataset deterministic: the same anchor
 * plus the same number of steps is always the same screen, so screenshots and
 * tests are reproducible and there is no race to wait out.
 */
export function DemoToolbar() {
  const controls = useDemoControls();
  if (controls === null) return null;

  return (
    <div className="demo-toolbar">
      <button
        type="button"
        className="btn btn--sm"
        onClick={controls.advance}
        disabled={!controls.hasPendingWork}
        title={
          controls.hasPendingWork
            ? 'Avança cada entrevista em processamento para o próximo estágio'
            : 'Nada em processamento para avançar'
        }
      >
        <Icon name="play" />
        Avançar esteira
      </button>
      <span className="demo-toolbar__step">
        passo <strong>{controls.step}</strong>
      </span>
    </div>
  );
}
