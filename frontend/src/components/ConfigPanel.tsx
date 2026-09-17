import { useEffect, useId, useState } from 'react';

import type { ApiConfig } from '../api/client';

interface Props {
  config: ApiConfig;
  onSave: (next: ApiConfig) => void;
  onClose: () => void;
}

// Runtime configuration form (API URL + X-API-Key), persisted by the caller in
// localStorage. The key is a password field with an explicit show/hide toggle.
export function ConfigPanel({ config, onSave, onClose }: Props) {
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState(false);

  const urlId = useId();
  const keyId = useId();

  useEffect(() => {
    setBaseUrl(config.baseUrl);
    setApiKey(config.apiKey);
  }, [config]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSave({ baseUrl, apiKey });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <section className="config-panel" aria-label="Configuração da API">
      <div className="config-panel__header">
        <h2>Configuração</h2>
        <button type="button" className="btn btn--icon" onClick={onClose} aria-label="Fechar configuração">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <form className="config-panel__form" onSubmit={submit}>
        <div className="field">
          <label htmlFor={urlId}>URL da API</label>
          <input
            id={urlId}
            type="url"
            inputMode="url"
            autoComplete="off"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:8000"
          />
        </div>
        <div className="field">
          <label htmlFor={keyId}>X-API-Key</label>
          <div className="field__with-button">
            <input
              id={keyId}
              type={reveal ? 'text' : 'password'}
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="(vazio em modo dev)"
            />
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setReveal((r) => !r)}
              aria-label={reveal ? 'Ocultar chave' : 'Mostrar chave'}
              aria-pressed={reveal}
            >
              {reveal ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          <p className="field__hint">
            A chave fica só no seu navegador (localStorage). Deixe em branco se a API roda sem
            API_KEY.
          </p>
        </div>
        <div className="config-panel__actions">
          <button type="submit" className="btn btn--primary">
            Salvar
          </button>
          {saved && (
            <span className="config-panel__saved" role="status">
              Configuração salva.
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
