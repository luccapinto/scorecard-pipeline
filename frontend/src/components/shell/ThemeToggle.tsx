import type { ThemePreference } from '../../config/preferences';
import type { IconName } from '../ui/Icon';
import { Icon } from '../ui/Icon';

interface Props {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}

const OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Tema claro', icon: 'sun' },
  { value: 'dark', label: 'Tema escuro', icon: 'moon' },
  { value: 'system', label: 'Seguir o sistema', icon: 'monitor' },
];

/**
 * A radiogroup, not a cycling button: three states behind one toggle is a
 * guessing game, and "which one am I on?" must be answerable without clicking.
 */
export function ThemeToggle({ value, onChange }: Props) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Tema">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`segmented__option ${value === option.value ? 'is-active' : ''}`}
          onClick={() => onChange(option.value)}
          title={option.label}
        >
          <Icon name={option.icon} />
          <span className="sr-only">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
