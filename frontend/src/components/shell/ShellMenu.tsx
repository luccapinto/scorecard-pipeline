import { useEffect, useId, useRef, useState } from 'react';

import type { ThemePreference } from '../../config/preferences';
import type { IconName } from '../ui/Icon';
import { Icon } from '../ui/Icon';

const THEMES: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Claro', icon: 'sun' },
  { value: 'dark', label: 'Escuro', icon: 'moon' },
  { value: 'system', label: 'Sistema', icon: 'monitor' },
];

interface Props {
  theme: ThemePreference;
  onThemeChange: (value: ThemePreference) => void;
  /** Present in demo mode only. */
  onReset?: () => void;
  /** Edition-specific entries (the full build links its API settings here). */
  children?: React.ReactNode;
}

/**
 * Everything a visitor rarely needs, behind one quiet button: theme and
 * "start the demo over". A disclosure, not an ARIA menu — the panel holds a
 * radiogroup and plain buttons, which every assistive technology already
 * drives, instead of a roving-focus widget that must be reimplemented.
 */
export function ShellMenu({ theme, onThemeChange, onReset, children }: Props) {
  const [open, setOpen] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const panelId = useId();
  const themeLabelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="shell-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setResetDone(false);
          setOpen((value) => !value);
        }}
      >
        <Icon name="sliders" />
        <span className="sr-only">Opções de exibição</span>
      </button>

      {open && (
        <div className="shell-menu__panel" id={panelId}>
          <p className="shell-menu__label" id={themeLabelId}>
            Tema
          </p>
          <div className="segmented" role="radiogroup" aria-labelledby={themeLabelId}>
            {THEMES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={theme === option.value}
                className={`segmented__option ${theme === option.value ? 'is-active' : ''}`}
                onClick={() => onThemeChange(option.value)}
              >
                <Icon name={option.icon} />
                {option.label}
              </button>
            ))}
          </div>

          {onReset !== undefined && (
            <div className="shell-menu__section">
              <button
                type="button"
                className="btn btn--ghost btn--sm btn--block"
                onClick={() => {
                  onReset();
                  setResetDone(true);
                }}
              >
                <Icon name="rotate" />
                Reiniciar demonstração
              </button>
              <p className="shell-menu__hint" role="status">
                {resetDone
                  ? 'Pronto: o cenário voltou ao início.'
                  : 'Desfaz decisões e simulações desta aba.'}
              </p>
            </div>
          )}

          {children !== undefined && <div className="shell-menu__section">{children}</div>}
        </div>
      )}
    </div>
  );
}
