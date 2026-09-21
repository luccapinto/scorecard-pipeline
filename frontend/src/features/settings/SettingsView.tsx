// Configuration screen.
//
// Everything here is user-owned state: where the API lives, the credential to
// reach it, and how the interface behaves. Nothing is pre-filled from anything
// but the props and the stored preferences — a settings screen that invents a
// value is a settings screen that lies about what is in effect.
//
// The API key is handled as a credential throughout: masked by default, never
// placed in a title, a label, an aria-label or any logged value.

import { useEffect, useId, useState } from 'react';

import { Icon } from '../../components/ui/Icon';
import type { ThemePreference } from '../../config/preferences';
import { DEFAULT_PREFERENCES, POLL_CHOICES } from '../../config/preferences';
import { usePreferences } from '../../hooks/usePreferences';

// The concrete shape of the API config. It is restated here rather than
// imported from `api/client`, which views are forbidden to touch
// (data/isolation.test.ts); the two are structurally identical.
export interface ApiConfigValue {
  baseUrl: string;
  apiKey: string;
}

interface Props {
  config: ApiConfigValue;
  onConfigChange: (next: ApiConfigValue) => void;
}

const THEMES: { value: ThemePreference; label: string; icon: 'sun' | 'moon' | 'monitor' }[] = [
  { value: 'light', label: 'Claro', icon: 'sun' },
  { value: 'dark', label: 'Escuro', icon: 'moon' },
  { value: 'system', label: 'Sistema', icon: 'monitor' },
];

export function SettingsView({ config, onConfigChange }: Props) {
  const { preferences, setPreferences } = usePreferences();

  const baseUrlId = useId();
  const apiKeyId = useId();
  const pollId = useId();
  const themeLabelId = useId();

  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [revealKey, setRevealKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  // The config is owned by App; if it changes elsewhere (or the mode swaps),
  // the form must show what is actually in effect rather than a stale draft.
  useEffect(() => {
    setBaseUrl(config.baseUrl);
    setApiKey(config.apiKey);
  }, [config.baseUrl, config.apiKey]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onConfigChange({ baseUrl, apiKey });
    setSaved(true);
  }

  return (
    <>
      <div className="view-head">
        <div className="view-head__text">
          <h1 className="view-head__title">Configuração</h1>
          <p className="view-head__sub">
            Conexão com a API e preferências desta interface. Tudo fica apenas neste navegador.
          </p>
        </div>
      </div>

      <section className="card" aria-labelledby="settings-api">
        <h2 className="card__title" id="settings-api">
          Conexão com a API
        </h2>
        <div className="card__body">
          <form className="settings-form" onSubmit={handleSubmit}>
            <div className="settings-field">
              <label className="settings-field__label" htmlFor={baseUrlId}>
                URL base
              </label>
              <input
                id={baseUrlId}
                className="settings-input mono"
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={baseUrl}
                onChange={(event) => {
                  setBaseUrl(event.target.value);
                  setSaved(false);
                }}
              />
              <p className="settings-help">
                Endereço onde a API está servindo, sem barra final. Ex.:{' '}
                <code className="mono">http://localhost:8000</code>
              </p>
            </div>

            <div className="settings-field">
              <label className="settings-field__label" htmlFor={apiKeyId}>
                Chave de API
              </label>
              <div className="settings-key">
                <input
                  id={apiKeyId}
                  className="settings-input mono"
                  type={revealKey ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    setSaved(false);
                  }}
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  aria-pressed={revealKey}
                  aria-label={revealKey ? 'Ocultar chave' : 'Mostrar chave'}
                  onClick={() => setRevealKey((current) => !current)}
                >
                  <Icon name={revealKey ? 'close' : 'search'} />
                  <span aria-hidden="true">{revealKey ? 'Ocultar' : 'Mostrar'}</span>
                </button>
              </div>
              <p className="settings-help">
                A chave fica no <code className="mono">localStorage</code> deste navegador e não é
                enviada a lugar nenhum além do cabeçalho <code className="mono">X-API-Key</code> nas
                requisições à API configurada acima.
              </p>
            </div>

            <div className="settings-actions">
              <button type="submit" className="btn btn--primary">
                Salvar
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setApiKey('');
                  onConfigChange({ baseUrl, apiKey: '' });
                  setRevealKey(false);
                  setSaved(false);
                }}
              >
                Limpar chave
              </button>
              <p className="settings-status" role="status">
                {saved ? 'Configuração salva neste navegador.' : ''}
              </p>
            </div>
          </form>
        </div>
      </section>

      <section className="card" aria-labelledby="settings-theme">
        <h2 className="card__title" id="settings-theme">
          Aparência
        </h2>
        <div className="card__body">
          <form className="settings-form" onSubmit={(event) => event.preventDefault()}>
            <fieldset className="settings-fieldset">
              <legend className="settings-field__label" id={themeLabelId}>
                Tema
              </legend>
              <div className="settings-radios">
                {THEMES.map((theme) => (
                  <label className="settings-radio" key={theme.value}>
                    <input
                      type="radio"
                      name="theme"
                      value={theme.value}
                      checked={preferences.theme === theme.value}
                      onChange={() => setPreferences({ theme: theme.value })}
                    />
                    <Icon name={theme.icon} />
                    <span>{theme.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="settings-help">
              A preferência <strong>Sistema</strong> acompanha o tema do sistema operacional em
              tempo real. A configuração <code className="mono">prefers-reduced-motion</code> do
              sistema é respeitada automaticamente: com ela ativa, as animações são desligadas.
            </p>
          </form>
        </div>
      </section>

      <section className="card" aria-labelledby="settings-poll">
        <h2 className="card__title" id="settings-poll">
          Atualização
        </h2>
        <div className="card__body">
          <form className="settings-form" onSubmit={(event) => event.preventDefault()}>
            <div className="settings-field">
              <label className="settings-field__label" htmlFor={pollId}>
                Intervalo de atualização
              </label>
              <select
                id={pollId}
                className="settings-input settings-input--select"
                value={preferences.pollIntervalMs}
                onChange={(event) => setPreferences({ pollIntervalMs: Number(event.target.value) })}
              >
                {POLL_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
              <p className="settings-help">
                Este intervalo só vale enquanto há algo efetivamente em processamento; sem trabalho
                em andamento a consulta fica bem mais espaçada. A atualização também pausa enquanto
                a aba está oculta e retoma quando ela volta a ficar visível.
              </p>
            </div>
          </form>
        </div>
      </section>

      <section className="card" aria-labelledby="settings-data">
        <h2 className="card__title" id="settings-data">
          Dados
        </h2>
        <div className="card__body">
          <p className="settings-help">
            Restaura tema e intervalo de atualização aos valores padrão. A URL base e a chave de API
            não são alteradas.
          </p>
          <div className="settings-actions">
            {confirmingReset ? (
              <>
                <p className="settings-confirm" role="status">
                  Restaurar as preferências padrão?
                </p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    setPreferences({
                      theme: DEFAULT_PREFERENCES.theme,
                      pollIntervalMs: DEFAULT_PREFERENCES.pollIntervalMs,
                    });
                    setConfirmingReset(false);
                  }}
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setConfirmingReset(false)}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setConfirmingReset(true)}
              >
                <Icon name="rotate" />
                Restaurar padrões
              </button>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
