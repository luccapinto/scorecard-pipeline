# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Não lançado]

## [0.1.0] - 2026-07-20

Primeira versão marcada do pipeline. A esteira roda de ponta a ponta:
ingestão por webhook → transcrição → diarização → scoring com evidências
verificadas → notificação e aprovação humana.

### Adicionado

- **Provider Deepgram nova-3** (`TRANSCRIPTION_PROVIDER=deepgram`, agora o
  padrão): transcrição e diarização em uma única chamada de API, sem modelos
  de ML locais e sem `HF_TOKEN`. Validado em entrevista real de 53 min.
- Flag `provides_diarization` na interface de transcrição; a etapa
  `DIARIZANDO` vira passthrough quando os segmentos já trazem speakers.
- `pyproject.toml` com metadados do projeto e configuração explícita de
  ruff, pytest, coverage e mypy.
- Verificação de tipos com mypy e varredura de segurança (`pip-audit`,
  `gitleaks`, CodeQL) na esteira de CI.
- Configuração de `pre-commit`, `.dockerignore`, `.gitattributes`,
  `CODE_OF_CONDUCT.md`, templates de issue e de pull request e Dependabot.
- Fixture `block_imports` nos testes, que força `ImportError` de forma
  determinística — a suíte agora passa com ou sem os backends de ML
  instalados.

### Alterado

- `TRANSCRIPTION_PROVIDER` passa a ter `deepgram` como padrão; `local`
  (WhisperX + pyannote) e `openai` seguem suportados sem mudança de
  comportamento.
- `DEEPGRAM_LANGUAGE` usa `multi` (code-switching) por padrão, preservando os
  termos técnicos em inglês que o modo monolíngue descarta.
- `SECURITY.md` documenta modelo de ameaças, prazos de resposta e o canal
  privado de reporte.
- Código modernizado para as convenções de tipagem do Python 3.11
  (PEP 585/604) e imports ordenados.

### Corrigido

- `HTTPException` levantada dentro de blocos `except` em `app/main.py` sem
  encadeamento (`raise ... from e`), o que descartava a causa original dos
  tracebacks do servidor.
- Transcrição via OpenAI quebrava com `TypeError` quando a resposta trazia
  `segments` nulo, em vez de tratar como lista vazia.
- Scoring sem `job_id` gerava um `FileNotFoundError` confuso apontando para
  `job_None.json`; agora falha com mensagem explícita.
- `python-dotenv` atualizado de 1.0.1 para 1.2.2 (PYSEC-2026-2270).

[Não lançado]: https://github.com/luccapinto/scorecard-pipeline/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/luccapinto/scorecard-pipeline/releases/tag/v0.1.0
