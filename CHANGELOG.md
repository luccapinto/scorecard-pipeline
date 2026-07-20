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
- Smoke test da imagem Docker no CI: além de construir, a esteira executa a
  imagem (`import app.main` + Alembic em modo offline), pegando bases
  incompatíveis que instalam mas quebram em runtime.
- Benchmark WER real: o caminho simulado (corrupção manual do texto de
  referência) foi removido. Provedores indisponíveis são reportados como
  pulados, com o motivo, e nunca substituídos por dados fabricados. Inclui
  guarda que detecta áudio sintético desatualizado.
- `README.en.md` e diagramas da arquitetura dupla (modo API e modo local) em
  ambos os READMEs.

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
- Dependências atualizadas na primeira rodada do Dependabot (GitHub Actions,
  sqlmodel, psycopg2-binary, ruff, mypy 2.x, pip-audit, whisperx,
  pyannote.audio 4.x).
- Dependabot agrupa bumps minor+patch num único PR semanal e ignora novas
  linhas de Python na imagem base — migração de runtime é decisão
  deliberada, não bump semanal.

### Corrigido

- `HTTPException` levantada dentro de blocos `except` em `app/main.py` sem
  encadeamento (`raise ... from e`), o que descartava a causa original dos
  tracebacks do servidor.
- Transcrição via OpenAI quebrava com `TypeError` quando a resposta trazia
  `segments` nulo, em vez de tratar como lista vazia.
- Scoring sem `job_id` gerava um `FileNotFoundError` confuso apontando para
  `job_None.json`; agora falha com mensagem explícita.
- `python-dotenv` atualizado de 1.0.1 para 1.2.2 (PYSEC-2026-2270).
- Migrações no CI falhavam com `ModuleNotFoundError: No module named 'app'`:
  o `alembic/env.py` importa `app.models`, mas o console script `alembic` não
  tem a raiz do repositório em `sys.path`. Resolvido com `prepend_sys_path`.
- Build da imagem no CI falhava ao exportar cache (`Cache export is not
  supported for the docker driver`); faltava o setup do buildx.

[Não lançado]: https://github.com/luccapinto/scorecard-pipeline/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/luccapinto/scorecard-pipeline/releases/tag/v0.1.0
