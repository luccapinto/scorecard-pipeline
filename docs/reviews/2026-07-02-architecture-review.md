# Revisão de Arquitetura e Engenharia — scorecard-pipeline

**Data:** 2026-07-02
**Escopo:** exploração completa do repositório (código-fonte, testes, CI, infraestrutura, documentação) em `main` (`98be18b`).
**Método:** leitura integral de todos os módulos de `app/`, `scripts/`, `tests/`, configs e docs; verificação empírica de dependências (instalação real de `rq==2.10.0` para confirmar quebra de API).

---

## 1. Sumário Executivo

O projeto tem uma **espinha dorsal conceitual muito boa**: máquina de estados explícita com transições validadas, retomada idempotente por etapa (checkpointing por coluna), validador programático de alucinação de evidências, human-in-the-loop obrigatório e ADRs que documentam trade-offs com honestidade. Para um pipeline de PoC, o desenho está acima da média.

Porém, a revisão encontrou **três problemas críticos que tornam o sistema não-funcional ou não-confiável em qualquer deploy real**, e que a suíte de testes (toda mockada) não detecta:

1. **O worker não inicia.** `run_worker.py` importa `rq.Connection`, API removida no RQ 2.0, com `rq==2.10.0` pinado. Confirmado empiricamente: `ImportError` na primeira linha de import. O pipeline inteiro está morto fora dos testes.
2. **Fallbacks de mock embutidos no código de produção.** `whisperx` e `pyannote.audio` não estão em `requirements.txt`; o provider default é `local`. Resultado: numa instalação padrão, transcrição e diarização retornam **dados falsos hardcoded com apenas um `logger.warning`**, e o sistema segue adiante gerando scorecards a partir deles.
3. **Timeout padrão do RQ (180s) vs. jobs de dezenas de minutos.** Transcrição + diarização de uma entrevista de 30–60 min em CPU excede em muito o `job_timeout` default; o job seria morto no meio, sem retry configurado, sem estado de falha na máquina de estados e sem tratamento de dead-letter queue.

Além disso, há achados de severidade alta em segurança (nenhuma autenticação, SSRF, botões de aprovação do Slack que simplesmente não funcionam), consistência (dual-write sem outbox, ausência de idempotência/locking) e integridade documental (o relatório de benchmark WER commitado foi gerado a partir de dados mock, mas se apresenta como comparação empírica).

A seção 3 detalha cada achado com evidência; a seção 4 traz o roadmap priorizado.

---

## 2. Visão de Arquitetura

### 2.1 Fluxo atual

```
POST /webhooks/recording (FastAPI)
  ├─ 1. valida existência da URL/caminho          [app/main.py:66]
  ├─ 2. INSERT Interview status=RECEBIDA          [app/main.py:79-82]
  └─ 3. enqueue process_interview no RQ           [app/main.py:95-96]

Worker RQ → process_interview(interview_id)       [app/tasks.py:11]
  RECEBIDA → TRANSCREVENDO → (transcribe) → DIARIZADA → (diarize+merge)
  → PONTUANDO → (LLM scoring + validação de evidência) → AGUARDANDO_APROVACAO
  → notificação Slack/Webhook

POST /interviews/{id}/action → APROVADA | REJEITADA (HITL)
```

### 2.2 Pontos fortes (a preservar)

- **Máquina de estados com transições validadas** (`VALID_TRANSITIONS`, `transition_to`, `app/models.py:23-93`) — impede saltos ilegais e é testada.
- **Checkpointing por etapa**: cada resultado intermediário é persistido e o orquestrador pula etapas já concluídas (`app/tasks.py:41,59,77`). O teste `test_process_interview_resilience_flow` prova a retomada após crash — é o melhor teste do repositório.
- **Validador de evidência anti-alucinação** (`EvidenceValidator`, `app/scoring.py:89-127`): checagem programática pós-LLM de que a citação existe na transcrição, com alerta explícito na notificação. Design raro de se ver bem-feito.
- **Abstrações pluggáveis**: `BaseTranscription`, `BaseNotification` — trocar provider é trivial.
- **ADRs de qualidade** (fila vs. polling, lookup determinístico vs. RAG, RQ vs. Celery, viés/BARS/HITL) — decisões justificadas com prós e contras reais.
- **Separação API ↔ worker** correta: o FastAPI nunca executa trabalho pesado.

### 2.3 Fraqueza estrutural transversal

O código de produção está **contaminado por lógica de teste**: checagens de `TEST_MODE` e retornos mock aparecem em `app/audio_processor.py:31-38, 84-90, 133-146` e `app/scoring.py:197-219`. Isso inverte a direção correta de dependência — é o teste que deve injetar dublês (via DI/fixtures), nunca o código de produção que deve saber que está sendo testado. Essa escolha é a raiz direta do achado crítico C2 e de vários falsos-verdes na suíte.

---

## 3. Achados

Severidade: **C** = crítico (sistema quebrado/não-confiável), **A** = alto (risco real em produção), **M** = médio (dívida relevante), **B** = baixo (higiene).

### CRÍTICOS

#### C1 — O worker não inicia: API `rq.Connection` removida no RQ 2.x
**Evidência:** `run_worker.py:3` (`from rq import Worker, Queue, Connection`) e `run_worker.py:21` (`with Connection(redis_conn):`), com `rq==2.10.0` em `requirements.txt:12`.
**Verificação empírica:** `pip install rq==2.10.0` + `from rq import Connection` → `ImportError: cannot import name 'Connection'`. O context manager `Connection` foi deprecado no RQ 1.12 e removido no 2.0.
**Impacto:** `python run_worker.py` morre no import. Nenhuma entrevista é processada, nunca. O CI não detecta porque nenhum teste importa `run_worker.py` — os testes chamam `process_interview` diretamente e mockam a fila.
**Correção:** `Worker([Queue("default", connection=redis_conn)], connection=redis_conn).work()` e adicionar um teste de smoke que ao menos importa o módulo do worker.

#### C2 — Motor de transcrição/diarização silenciosamente falso em produção
**Evidência:** `requirements.txt` não contém `whisperx`, `pyannote.audio` nem `torch`. O provider default é `local` (`app/config.py:6`). Em `app/audio_processor.py:31-38`, o `ImportError` de `whisperx` cai num **mock hardcoded** ("Mock local transcription start.") com apenas `logger.warning`; idem para `pyannote` em `:133-138`.
**Impacto:** numa instalação seguindo o README à risca, o pipeline "funciona" de ponta a ponta produzindo scorecards sobre **transcrições inventadas** — o pior modo de falha possível: silencioso e plausível. Um recrutador receberia no Slack uma avaliação fabricada.
**Correção:** dependência ausente deve ser **erro fatal** (fail-fast no startup do worker, não no meio do job). Mocks saem do código de produção e viram fixtures/dublês injetados nos testes. Se o intuito é manter o repositório leve, criar `requirements-ml.txt` ou extras (`pip install .[local-stt]`) e validar na inicialização que o provider configurado é executável.

#### C3 — Timeout, retry e falha de job não tratados: entrevistas presas para sempre
**Evidência:** `app/main.py:96` — `q.enqueue(process_interview, str(interview.id))` sem `job_timeout`, sem `retry=Retry(max=N)`, sem `failure_ttl`. O default do RQ é **180 segundos** de timeout.
**Impacto:**
- Transcrever + diarizar 30–60 min de áudio em CPU (`whisper_device: cpu`, `app/config.py:10`) leva ordens de magnitude mais que 180s → o RQ mata o job no meio (`JobTimeoutException`).
- Não existe estado `FALHOU` na máquina de estados (`app/models.py:9-16`); uma entrevista cujo job morreu fica eternamente em `TRANSCREVENDO`/`PONTUANDO` com `error_log` preenchido, invisível para operação.
- Jobs que estouram exceção vão para a `FailedJobRegistry` do RQ e ninguém os re-enfileira nem monitora.
**Correção:** `job_timeout` dimensionado (ex.: 2h), `Retry(max=3, interval=[60, 300, 900])` para falhas transientes, estado `FALHOU` explícito + endpoint/rotina de reprocessamento, e monitoramento da failed registry.

### ALTOS

#### A1 — Nenhuma autenticação ou autorização em nenhum endpoint
**Evidência:** `app/main.py` — `/webhooks/recording`, `/interviews/{id}`, `/interviews/{id}/action` são todos públicos. Não há verificação de assinatura do webhook (HMAC), API key, nem nada.
**Impacto:** qualquer pessoa com acesso à rede pode injetar entrevistas falsas, ler transcrições e scorecards (PII sensível de candidatos) e **aprovar/rejeitar candidatos** — o callback de decisão humana, justamente a salvaguarda ética do ADR 0004, é forjável por qualquer um.
**Correção:** assinatura HMAC no webhook, autenticação (API key/OAuth) nos endpoints de leitura e ação, e tokens de ação de uso único para os botões de aprovação.

#### A2 — SSRF e sondagem de arquivos locais via `recording_url`
**Evidência:** `validate_recording_url` (`app/main.py:43-58`) aceita qualquer `http(s)://` e qualquer caminho local; o worker baixa a URL sem restrição (`app/services.py:23-33`).
**Impacto:** (a) **SSRF** — um atacante aponta `recording_url` para `http://169.254.169.254/...` ou serviços internos e o worker faz a requisição; (b) **oracle de existência de arquivos** — a resposta 400 vs. 202 revela se qualquer caminho existe no servidor da API; (c) o worker aceita "transcrever" qualquer arquivo local legível.
**Correção:** allowlist de domínios/prefixos de storage (ex.: bucket S3 assinado), bloquear IPs privados/link-local na resolução, e eliminar aceitação de caminho local arbitrário fora de ambiente dev.

#### A3 — Botões de aprovação do Slack não funcionam (HITL quebrado no canal principal)
**Evidência:** `app/notifications.py:93-125` gera botões com `url = f"{base_url}/interviews/{id}/action?action=approve"`. Botões `url` do Slack abrem o link no navegador → **GET** com query string. O endpoint é **POST** e lê a ação do **corpo JSON** (`app/main.py:129-133`, `ActionPayload`).
**Impacto:** clicar em "Aprovar ✔️" resulta em `405 Method Not Allowed`. O fluxo de decisão humana — coração do produto e do ADR 0004 — não funciona pelo Slack; só via `curl`.
**Correção:** ou uma página/endpoint GET intermediário com token de uso único que confirma e faz o POST, ou Slack interactivity de verdade (`action_id` + request URL com verificação de assinatura do Slack).

#### A4 — Dual-write sem outbox: entrevistas órfãs
**Evidência:** `app/main.py:79-105` — commit no Postgres, depois enqueue no Redis. Se o enqueue falha, retorna 500, mas o registro `RECEBIDA` já está commitado.
**Impacto:** registro órfão que nunca será processado (não há job) nem reconciliado (não há varredura). O comentário no próprio código (`app/main.py:99-101`) admite a dúvida sem resolvê-la.
**Correção:** padrão transactional outbox, ou — pragmático para o porte atual — job periódico de reconciliação que re-enfileira `RECEBIDA` mais antigas que N minutos (idempotente graças ao checkpointing já existente).

#### A5 — Sem idempotência nem controle de concorrência
**Evidência:** o webhook não tem chave de deduplicação (reenvio do provedor de gravação cria entrevista duplicada); `process_interview` não usa `SELECT ... FOR UPDATE` nem versão otimista; `updated_at` só é atualizado dentro de `transition_to` (`app/models.py:93`), não nos commits de payload.
**Impacto:** o mesmo job enfileirado duas vezes (retry de webhook, re-enqueue manual) roda em dois workers simultaneamente: custo de LLM em dobro, gravações intercaladas e `InvalidStateTransitionError` espúrios.
**Correção:** unique constraint em `(recording_url, job_id)` ou `external_id` de dedup; lock pessimista (`with_for_update`) no início de `process_interview`; `onupdate` para `updated_at`.

#### A6 — Relatório de benchmark "empírico" gerado com dados mock
**Evidência:** `docs/reports/benchmark_wer_report.md` commitado exibe tempos de processamento `0.00s` — impossível para transcrição real. A causa está em `scripts/run_benchmark.py:135-136`: `use_mock_local` depende de `OPENAI_API_KEY` (irrelevante para o engine local WhisperX), e o mock (`get_mock_transcription`, `:82-104`) **fabrica os erros** que o relatório depois "analisa". Os números 4,07% vs. 0,00% de WER são autorreferentes: o script compara o texto de referência com uma corrupção dele mesmo, escrita à mão.
**Impacto:** o documento se apresenta como "comparação empírica" e fundamenta a escolha de provider com dados inventados. Isso compromete a credibilidade técnica do repositório inteiro.
**Correção:** rotular inequivocamente execuções mock no relatório (título e cada linha), corrigir as condições de mock por engine, e só commitar relatório de execução real.

#### A7 — Sem migrações de schema (Alembic)
**Evidência:** `create_db_and_tables()` no startup da API (`app/main.py:19`, `app/database.py:16-18`).
**Impacto:** `create_all` não altera tabelas existentes; qualquer mudança de modelo (ex.: adicionar o estado `FALHOU` ou índice) exige intervenção manual em produção. Além disso, a API criar schema no boot é responsabilidade errada (corrida entre réplicas).
**Correção:** Alembic com migrações versionadas; remover DDL do startup.

### MÉDIOS

#### M1 — Áudio baixado duas vezes e inteiro em memória
`resolve_audio_path` é chamada por `transcribe_audio` **e** `diarize_audio` (`app/services.py:44,74`) — o mesmo arquivo é baixado duas vezes por entrevista, com `httpx.get(...).content` carregando o WAV inteiro em RAM (60 min ≈ centenas de MB), sem timeout explícito, sem limite de tamanho e sem verificação de content-type. Baixar uma vez por job, em streaming para disco, e passar o caminho adiante.

#### M2 — Modelos ML recarregados a cada job
`whisperx.load_model` (`app/audio_processor.py:42`) e `Pipeline.from_pretrained` do pyannote (`:149`) rodam dentro de cada chamada. Carregar Whisper + pipeline de diarização leva dezenas de segundos a minutos e domina o tempo de job. O padrão correto com RQ é cache de modelo no processo do worker (singleton lazy por processo, ou worker "warm" dedicado).

#### M3 — Semântica enganosa da máquina de estados e ausência de estado de erro
`DIARIZADA` significa na prática "transcrito, diarizando agora" (`app/tasks.py:52-65`); `TRANSCREVENDO` é setado **antes** de transcrever. Os nomes mentem sobre o que está acontecendo, o que confunde operação e consumidores da API de status. Somado à ausência de `FALHOU` (ver C3), o observador externo não distingue "processando" de "morto". Renomear para estados de fase (`TRANSCRICAO_EM_ANDAMENTO`/`TRANSCRITA`, …) ou pares doing/done, e adicionar estado terminal de falha com contador de tentativas.

#### M4 — Modelagem de dados fraca
- `transcription_raw`, `diarization_raw`, `scorecard` são `Optional[Any]` em coluna `JSON` genérica (`app/models.py:47-58`); o import de `JSONB` (`:6`) está morto. Em Postgres, `JSONB` daria indexação e validação melhores.
- Sem índices em `status` e `job_id` — as consultas operacionais óbvias ("entrevistas presas", "por vaga") farão seq scan.
- `datetime` sem `timezone=True` → colunas `TIMESTAMP WITHOUT TIME ZONE` recebendo datetimes UTC-aware; risco clássico de comparação/exibição.
- O scorecard como JSON opaco impede consultas relacionais (média de score por competência, taxa de alucinação por modelo) que são exatamente as análises que um pipeline desses precisa suportar.

#### M5 — Validador de evidência frágil diante de transcrição real
`validate_evidence` exige substring exata (pós-normalização) (`app/scoring.py:113-127`). Com WER real de 4–10% (o próprio benchmark do projeto assume isso), uma citação legítima do LLM sobre trecho com erro de transcrição falhará → **falsos alertas de alucinação**, minando a confiança do recrutador no alerta. Usar fuzzy matching (ex.: `rapidfuzz.partial_ratio` com threshold ~90) e reportar o grau de similaridade.

#### M6 — ScoringEngine sem guard-rails de LLM
- `score: int` sem `Field(ge=1, le=5)` (`app/scoring.py:18`) — o modelo pode devolver 0 ou 7 e o Pydantic aceita.
- `overall_recommendation` é `str` livre em vez de `Literal["Aprovado", "Rejeitado", "Próxima Etapa"]`.
- Sem `temperature=0` (avaliação deve ser o mais determinística possível), sem retry quando `model_validate_json` falha (JSON inválido mata o job inteiro), e usando `json_object` genérico em vez de structured outputs/`json_schema` que o OpenRouter suporta.
- `logger.info(f"OpenRouter response: {content}")` (`:243`) grava a avaliação completa do candidato (PII) em log de nível INFO.
- O schema é duplicado à mão dentro do system prompt (`:160-172`) em vez de derivado do modelo Pydantic (`ScorecardOutput.model_json_schema()`) — vai divergir na primeira mudança.

#### M7 — Observabilidade quase inexistente
Só há `logging` básico: sem logs estruturados (JSON), sem correlation ID (o `interview_id` não acompanha todas as mensagens), sem métricas (profundidade de fila, duração por etapa, taxa de falha, custo de LLM), sem healthcheck (`/health` na API, liveness do worker), sem error tracking (Sentry). Para um sistema assíncrono multi-processo, isso torna qualquer incidente uma caça às cegas — o próprio ADR 0001 lista "complexidade de depuração" como contra da arquitetura e nada foi feito para mitigá-la.

#### M8 — Configuração de transcrição subótima para o caso de uso
O produto é explicitamente sobre code-switching PT-EN, mas `LocalTranscription` deixa o idioma em auto-detect (`app/audio_processor.py:43` não passa `language="pt"`), o que degrada exatamente o cenário-alvo; `batch_size=16` hardcoded é agressivo para CPU/int8; a falha de alinhamento do WhisperX degrada silenciosamente os timestamps (`:60-62`) — que são o insumo do merge de diarização — sem sinalizar o downstream.

#### M9 — PII/LGPD sem tratamento
Transcrições integrais, nomes e avaliações de candidatos ficam para sempre no banco, sem política de retenção, sem criptografia em nível de aplicação, e vazam para logs (M6) e para o Slack. Para um sistema de RH no Brasil, LGPD exige no mínimo: retenção definida, base legal documentada e minimização nos logs/notificações.

### BAIXOS

- **B1 — Gestão de dependências:** um único `requirements.txt` mistura produção com dev/test (`pytest`, `edge-tts`), sem lockfile nem `pyproject.toml`. Migrar para `pyproject.toml` + `uv`/`pip-tools`, com extras separados (`dev`, `ml`).
- **B2 — Containerização incompleta:** o README anuncia "Docker + Docker Compose" e existe `entrypoint.sh`, mas **não há Dockerfile**; o compose só sobe Postgres/Redis, com senha hardcoded (`docker-compose.yml:10`) e a chave `version: '3.8'` obsoleta. Sem healthchecks.
- **B3 — Duplicação:** `clean_text` existe idêntica em `app/scoring.py:30-50` e `scripts/run_benchmark.py:24-49`.
- **B4 — CI superficial:** o workflow sobe Postgres e Redis (`.github/workflows/ci.yml:13-36`) que **nenhum teste usa** (a suíte roda em SQLite in-memory e mocka a fila); não há lint (ruff), type-check (mypy) nem cobertura. É por isso que C1 e C2 passam verdes.
- **B5 — `entrypoint.sh` frágil:** `export $(grep -v '^#' .env | xargs)` quebra com valores contendo espaços ou `=`.
- **B6 — DI fraca:** engine e fila são globals de módulo; os testes precisam de `patch("app.tasks.engine", ...)` — sintoma de acoplamento. Imports tardios dentro de funções (`app/main.py:92-93`, `app/services.py:110,134-138`) mascaram o grafo de dependências.
- **B7 — `data/` gitignorado com `jobs_dir` default apontando para ele:** num clone fresco, `ContextAggregator` falha com `FileNotFoundError` até rodar o gerador sintético; combinado com C3, a entrevista fica presa em `PONTUANDO` sem estado de erro visível.
- **B8 — Testes rodam contra SQLite, produção é Postgres:** diferenças de comportamento de JSON, enum e transação nunca são exercitadas; o handler global de exceção (`app/main.py:30-36`) devolve `str(exc)` ao cliente (vazamento de detalhe interno) e não é testado.

---

## 4. Roadmap Priorizado

### Fase 0 — Tornar o sistema real (bloqueante, ~1–2 dias)
1. **C1:** corrigir `run_worker.py` para a API do RQ 2.x + teste de smoke que importa o worker.
2. **C2:** remover todos os mocks/`TEST_MODE` do código de produção; fail-fast se o provider configurado não é executável; dependências ML em extra explícito.
3. **C3:** `job_timeout` adequado, `Retry` do RQ, estado `FALHOU` na máquina de estados, alarme sobre a `FailedJobRegistry`.
4. **A3:** consertar o fluxo de aprovação via Slack (é o produto).

### Fase 1 — Confiabilidade e segurança mínimas (~1 semana)
5. **A1/A2:** HMAC no webhook, auth nos endpoints, allowlist de origem de áudio, bloquear caminhos locais/IPs internos.
6. **A4/A5:** reconciliação de órfãs + dedup de webhook + lock em `process_interview`.
7. **A7:** Alembic; retirar DDL do startup.
8. **M1/M2:** download único em streaming por job; cache de modelos por processo de worker.
9. **A6:** corrigir/rotular o benchmark e regerar o relatório com dados reais.

### Fase 2 — Estado da arte operacional (~2–3 semanas)
10. **M7:** logs estruturados com `interview_id` como correlation ID, métricas Prometheus (fila, duração por etapa, custo LLM), `/health`, Sentry.
11. **M4:** JSONB, índices, `timezone=True`, normalizar avaliações em tabela própria.
12. **M5/M6:** fuzzy matching de evidência; `Literal`/`ge/le` no schema, `temperature=0`, retry de parsing, structured outputs, prompt derivado do schema Pydantic.
13. **M3:** renomear estados + estado de erro com contador de tentativas.
14. **M9:** política de retenção e minimização de PII em logs/notificações.
15. **B1/B2/B4:** `pyproject.toml` + lockfile, Dockerfile real (API e worker no compose), CI com ruff + mypy + cobertura e um teste de integração real contra Postgres/Redis do próprio CI.

### Fase 3 — Evolução de produto
- Diarização integrada à transcrição num único passe (WhisperX já integra pyannote nativamente via `assign_word_speakers` — hoje o projeto usa os dois separadamente e re-implementa o merge à mão em `merge_transcription_and_diarization`).
- Mapeamento speaker→papel (Entrevistador/Candidato) — hoje o scorecard ignora completamente a diarização: `score_interview` recebe `diarization` e não a usa (`app/services.py:105-128`), então todo o custo de diarizar não agrega nada à avaliação. Injetar o diálogo rotulado no prompt é ganho imediato de qualidade.
- Avaliação contínua do scoring (golden set de entrevistas com notas humanas, medir drift por modelo/versão de prompt).
- Storage de áudio próprio (S3/GCS com URLs assinadas) em vez de aceitar URL arbitrária.

---

## 5. Status de Implementação (2026-07-02)

As correções foram implementadas no mesmo branch desta revisão:

| Achado | Status | Como |
|---|---|---|
| C1 | ✅ Corrigido | `run_worker.py` migrado para a API do RQ 2.x + teste de smoke que importa o worker |
| C2 | ✅ Corrigido | Mocks e `TEST_MODE` removidos do código de produção; dependência ausente → `TranscriptionDependencyError`; validação fail-fast no startup do worker; extras em `requirements-ml.txt` |
| C3 | ✅ Corrigido | `job_timeout` configurável (2h default), `Retry(max=3, interval=[60,300,900])`, estado `FALHOU` + `retry_count`, endpoint `POST /interviews/{id}/reprocess` com retomada por checkpoint |
| A1 | ✅ Corrigido | HMAC-SHA256 no webhook (`WEBHOOK_HMAC_SECRET`), API key (`X-API-Key`) nos endpoints de leitura/ação; sem secret/key configurados, dev-mode com warning |
| A2 | ✅ Corrigido | Guarda anti-SSRF (bloqueio de IPs privados/loopback/link-local, schemes restritos), caminhos locais restritos a `AUDIO_ALLOWED_DIR`, mensagem de erro uniforme (sem oracle) |
| A3 | ✅ Corrigido | Endpoint GET `/interviews/{id}/decision` com token de uso único; botões do Slack e webhook genérico apontam para ele |
| A4 | ✅ Corrigido | `app/maintenance.py::requeue_stale_interviews` + `POST /admin/reconcile` + CLI `python -m app.maintenance` |
| A5 | ✅ Corrigido | `external_id` único como chave de idempotência do webhook; `SELECT ... FOR UPDATE` no worker; no-op para entrevistas já entregues; `onupdate` em `updated_at` |
| A6 | ✅ Corrigido | Condições de mock por engine corrigidas; relatório rotula `SIMULADO (mock)` vs `REAL` em cada linha; relatório commitado corrigido com aviso destacado |
| A7 | ✅ Corrigido | Alembic com migração inicial (validada upgrade/downgrade/upgrade no CI contra Postgres real); DDL removido do startup da API |
| M1 | ✅ Corrigido | `AudioSource`: download único por job, streaming para disco, timeout e limite de tamanho (`MAX_AUDIO_BYTES`) |
| M2 | ✅ Corrigido | Cache de modelos por processo de worker (WhisperX, align model e pipeline pyannote) |
| M3 | ✅ Corrigido | `DIARIZADA` → `DIARIZANDO` (semântica honesta) + estado `FALHOU` |
| M4 | ✅ Parcial | JSONB no Postgres (variant), índices em `status`/`job_id`/`external_id`, `DateTime(timezone=True)`. Normalização do scorecard em tabela própria: deferida (Fase 2) |
| M5 | ✅ Corrigido | Fuzzy matching (RapidFuzz `partial_ratio`, threshold configurável) com fallback para match exato |
| M6 | ✅ Corrigido | `score` com `ge=1, le=5`, `overall_recommendation` como `Literal`, `temperature=0`, retry de parsing (3 tentativas com feedback do erro), structured outputs `json_schema` derivado do Pydantic, resposta da LLM só em DEBUG |
| M7 | ✅ Parcial | Logs com correlation id (`interview_id` via contextvar), formatter JSON opcional (`LOG_JSON`), `/health`, duração por etapa. Prometheus/Sentry: deferidos (infra) |
| M8 | ✅ Corrigido | `WHISPER_LANGUAGE=pt` default, `batch_size` configurável, falha de alinhamento logada como ERROR |
| M9 | ✅ Parcial | PII fora dos logs (INFO), retenção via `purge_old_interviews` + `RETENTION_DAYS`. Criptografia em nível de aplicação: deferida |
| B1 | ✅ Corrigido | `requirements.txt` (prod) / `requirements-dev.txt` / `requirements-ml.txt` |
| B2 | ✅ Corrigido | `Dockerfile` (arg `INSTALL_ML`), compose com API + worker + healthchecks, senha via env var, `version:` removido |
| B3 | ✅ Corrigido | `clean_text` unificada em `app/text_utils.py` |
| B4 | ✅ Corrigido | CI com ruff, cobertura e validação de migração contra o Postgres do próprio CI; `TEST_MODE` eliminado |
| B5 | ✅ Corrigido | `entrypoint.sh` com `set -a; source .env` |
| B6 | ✅ Parcial | Imports tardios removidos de `app/main.py`; DI completa (engine/fila injetáveis): deferida |
| B7 | ✅ Mitigado | Falha de contexto agora leva a `FALHOU` visível com `error_log`, em vez de estado preso |
| B8 | ✅ Corrigido | Handler global não ecoa mais `str(exc)`; testes de auth/HMAC/decision adicionados |

Fase 3 (diarização single-pass com WhisperX, golden set de avaliação, storage S3) permanece como evolução de produto. O diálogo diarizado agora **é** injetado no prompt de scoring (ganho imediato apontado na Fase 3).

## 6. Observação final

O contraste central do repositório: o **desenho** (estados, checkpointing, HITL, anti-alucinação, ADRs) é maduro, mas a **execução** nunca foi validada de ponta a ponta com componentes reais — worker que não sobe, motores de ML ausentes das dependências, botões de aprovação quebrados e benchmark simulado passariam despercebidos até o primeiro deploy. A prioridade número um não é adicionar features: é fechar o vão entre o que os testes provam (unidades mockadas) e o que o sistema faz de verdade (integração real). Um único teste E2E em CI com Redis + Postgres reais e um worker RQ de verdade teria capturado 3 dos 4 achados mais graves.
