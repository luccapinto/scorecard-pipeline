# Pipeline de Scorecard de Entrevistas com IA

[![CI](https://github.com/luccapinto/scorecard-pipeline/actions/workflows/ci.yml/badge.svg)](https://github.com/luccapinto/scorecard-pipeline/actions/workflows/ci.yml)
[![Python Version](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CodeQL](https://github.com/luccapinto/scorecard-pipeline/actions/workflows/codeql.yml/badge.svg)](https://github.com/luccapinto/scorecard-pipeline/actions/workflows/codeql.yml)

📖 **[Read this in English](README.en.md)**

## 🏗️ Arquitetura do Sistema

O pipeline é projetado para processar cada gravação de entrevista individualmente, sem polling periódico e sem loteamento.

```mermaid
flowchart TD
    subgraph Entrada
        Webhook[Webhook de Ingestão: POST /webhooks/recording + HMAC]
    end

    subgraph Fila & Persistência
        Redis[(Redis Queue - RQ)]
        Postgres[(PostgreSQL)]
    end

    subgraph Worker de Processamento
        Worker[Worker RQ]
        Transcribe[Motor Transcrição: WhisperX / OpenAI API / Deepgram API]
        Diarize[Diarização: pyannote.audio ou Deepgram nativa]
        Context[Agregador de Contexto: Job/BARS/Checklist]
        LLM[Scoring LLM: OpenRouter + Pydantic]
        Validator[Validador de Evidências: Mitigação de Alucinação]
    end

    subgraph Notificação & Decisão
        Slack[Slack Block Kit / Webhook]
        Approver[Decisão Humana: link com token de uso único ou POST /interviews/id/action]
    end

    Webhook -->|1. Salva status recebida| Postgres
    Webhook -->|2. Enfileira Job com timeout+retry| Redis
    Redis -->|3. Consome| Worker
    Worker -->|4. Transcreve| Transcribe
    Worker -->|5. Diariza| Diarize
    Worker -->|6. Agrega requisitos da vaga| Context
    Worker -->|7. Gera notas| LLM
    Worker -->|8. Valida citações de texto| Validator
    Worker -->|9. Atualiza progresso & persistência| Postgres
    Worker -->|10. Notifica scorecard| Slack
    Slack -->|11. Avaliador aprova/rejeita| Approver
    Approver -->|12. Estado Final| Postgres
```

### Máquina de Estados

```
recebida → transcrevendo → diarizando → pontuando → aguardando_aprovacao → aprovada | rejeitada
                 ↘             ↘            ↘
                              falhou  (reprocessável via POST /interviews/{id}/reprocess)
```

Cada etapa persiste um checkpoint (`transcription_raw`, `diarization_raw`, `scorecard`);
uma entrevista que falhou retoma exatamente do ponto onde parou, sem repetir
transcrição/diarização já concluídas. Jobs são enfileirados com `job_timeout`
dimensionado para áudios longos e retry automático com backoff.

---

## 🛠️ Stack Tecnológica

- **Core & API:** Python 3.11 + FastAPI (Uvicorn)
- **Fila de Mensageria:** Redis + RQ (Redis Queue) com timeout e retries configurados
- **Persistência de Estado:** PostgreSQL (SQLAlchemy / SQLModel, JSONB) + Alembic (migrações)
- **Transcrição (STT):** Deepgram nova-3 (Nuvem, **default**, com diarização nativa) / WhisperX (Local) / OpenAI API (Nuvem)
- **Diarização (Speakers):** nativa no modo Deepgram (default); Pyannote.audio (`pyannote/speaker-diarization-3.1`) nos modos local/openai
- **Motor de Scoring:** OpenRouter (structured outputs JSON Schema derivado de Pydantic, `temperature=0`)
- **Validação de Evidência:** matching exato + fuzzy (RapidFuzz) tolerante a WER real
- **Geração de Dados Sintéticos:** `edge-tts` (TTS multi-voz Azure) + Templates de Vaga estruturados
- **Notificações:** Slack Webhook (Block Kit) com links de decisão por token de uso único + Webhook Genérico HTTP
- **Segurança:** HMAC no webhook de ingestão, API key nos endpoints, guarda anti-SSRF no download de áudio
- **Containerização:** Docker + Docker Compose (API + worker + Postgres + Redis)

---

## 📖 Decisões de Arquitetura (ADRs)

Documentamos detalhadamente as principais escolhas técnicas do projeto através de Architecture Decision Records (ADRs):

1. **[ADR 0001 — Fila vs. Polling](docs/adr/0001-fila-vs-polling.md):** Uso de arquitetura orientada a eventos com Redis Queue frente a consultas periódicas.
2. **[ADR 0002 — Lookup Determinístico vs. RAG](docs/adr/0002-lookup-deterministico-vs-rag.md):** Por que optamos por lookup de arquivos locais de vagas em vez de buscas semânticas vetoriais para montagem do prompt.
3. **[ADR 0003 — Escolha de Fila Simples (RQ) vs. Celery](docs/adr/0003-rq-vs-celery.md):** Balanceamento de complexidade e robustez com RQ.
4. **[ADR 0004 — Risco de Viés em Avaliação de Cultura](docs/adr/0004-avaliacao-cultura-fit-bias.md):** Mitigações éticas baseadas em âncoras BARS, evidências literais obrigatórias e validação humana mandate.

Há também uma revisão completa de arquitetura em [docs/reviews/](docs/reviews/).

---

## 📂 Estrutura de Diretórios

```text
├── app/
│   ├── main.py            # FastAPI Webhooks, decisão humana, health e admin
│   ├── models.py          # Tabela Interview e máquina de estados (inclui FALHOU)
│   ├── database.py        # Conexão e sessão do PostgreSQL / SQLite
│   ├── config.py          # Configurações de variáveis de ambiente (Pydantic Settings)
│   ├── queue.py           # Conexão com Redis Queue + política de timeout/retry
│   ├── tasks.py           # Orquestração resiliente da esteira do Worker (com lock)
│   ├── audio_processor.py # Drivers WhisperX (local), OpenAI e Deepgram (nuvem) e Pyannote (com cache de modelos)
│   ├── scoring.py         # Contexto, OpenRouter (structured outputs) e validador de evidência fuzzy
│   ├── notifications.py   # Slack Block Kit e Webhook genérico com links de decisão por token
│   ├── security.py        # Verificação HMAC do webhook e API key
│   ├── maintenance.py     # Reconciliação de entrevistas órfãs e retenção (LGPD)
│   ├── logging_config.py  # Logging estruturado com correlation id (interview_id)
│   ├── text_utils.py      # Normalização de texto compartilhada
│   └── schemas.py         # Validação Pydantic (Vagas, checklists e scorecards)
├── alembic/               # Migrações de schema versionadas
├── data/
│   └── synthetic/         # JSONs de vaga e áudios de teste gerados sinteticamente
├── docs/
│   ├── adr/               # Architecture Decision Records (ADRs)
│   ├── reports/           # Relatório comparativo de Word Error Rate (WER)
│   ├── reviews/           # Revisões de arquitetura
│   └── specs/             # Especificações de design SDD (Spec Driven Development)
├── scripts/
│   ├── generate_synthetic.py  # Script CLI gerador de TTS e vaga para testes locais
│   └── run_benchmark.py       # Script CLI comparador de WER entre provedores
├── tests/                 # Suíte de testes (pytest)
├── Dockerfile             # Imagem da API e do worker
├── docker-compose.yml     # Stack completa: Postgres, Redis, API e worker
├── requirements.txt       # Dependências de produção
├── requirements-dev.txt   # Dependências de desenvolvimento/teste
├── requirements-ml.txt    # Backends ML pesados (WhisperX, pyannote)
└── run_worker.py          # Worker RQ com validação fail-fast de dependências
```

---

## 🚀 Como Executar Localmente

### 1. Pré-requisitos
- Docker instalado na máquina.
- Python 3.11 instalado localmente.

### 2. Configurando o Ambiente
Copie o arquivo `.env.example` para `.env`:
```bash
cp .env.example .env
```
Preencha as variáveis conforme necessário:
- `DEEPGRAM_API_KEY`: Chave da Deepgram para o provider default de transcrição + diarização (nova-3). Veja a seção *Transcrição & Diarização* abaixo.
- `OPENROUTER_API_KEY`: Chave para o motor de Scoring (LLM).
- `HF_TOKEN`: Token do Hugging Face com acesso ao `pyannote/speaker-diarization-3.1` — **apenas** para os providers `local`/`openai`.
- `OPENAI_API_KEY`: apenas para `TRANSCRIPTION_PROVIDER=openai`.
- `SLACK_WEBHOOK_URL` (Opcional): Para testar notificações no Slack.
- **Em produção, sempre defina:** `WEBHOOK_HMAC_SECRET` (assinatura do webhook), `API_KEY` (auth dos endpoints) e `AUDIO_ALLOWED_DIR` (restringe caminhos locais de áudio).

### 3. Opção A — Stack completa com Docker Compose
```bash
docker compose up -d --build
```
Sobe Postgres, Redis, a API (com migrações aplicadas automaticamente) e o worker
(imagem com os backends ML instalados via `INSTALL_ML=true`).

### 3. Opção B — Infra no Docker, app local
```bash
docker compose up -d postgres redis
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
# Backends ML locais (WhisperX + pyannote — pesado, requer torch):
pip install -r requirements-ml.txt
```

### 4. Aplicando as Migrações de Banco
O schema é gerenciado pelo Alembic (a API não cria tabelas no startup):
```bash
alembic upgrade head
```

### 5. Dataset Sintético de Teste
O repositório já inclui em `data/synthetic/` os arquivos JSON (vaga, competências
BARS, checklist e roteiro de diálogo) de **três perfis de entrevista realistas**,
cobrindo todo o espectro de avaliação:

| Perfil | Vaga | Candidato | Resultado esperado |
|---|---|---|---|
| `python_pleno` | Desenvolvedor Python Pleno | Forte (métricas concretas, incidente real, boas práticas) | Aprovado |
| `dados_senior` | Engenheiro de Dados Sênior | Misto (forte em pipelines/Spark, fraco em streaming) | Próxima Etapa |
| `frontend_junior` | Frontend Júnior (React) | Fraco (respostas vagas, conceitos confundidos) | Rejeitado |

Para gerar os áudios `.wav` multi-voz (requer acesso à internet para o TTS):
```bash
python scripts/generate_synthetic.py                       # todos os perfis
python scripts/generate_synthetic.py --profile dados_senior  # um perfil específico
python scripts/generate_synthetic.py --skip-audio          # apenas regenerar os JSONs
```

### 6. Executando o Worker RQ e o Servidor Web
Abra dois terminais (com o ambiente virtual ativo):

**Terminal 1 (Worker):**
```bash
python run_worker.py
```
O worker valida na inicialização que o provider configurado é executável
(whisperx/pyannote instalados, chaves definidas) e falha imediatamente com uma
mensagem clara caso contrário — nunca processa com dados simulados.

**Terminal 2 (API FastAPI):**
```bash
python -m uvicorn app.main:app --reload
```

---

## 🖥️ Interface Web (estado atual)

O diretório `frontend/dist/` contém uma SPA React **pré-compilada** que consome
a API (`GET /jobs`, `GET /recordings`, `GET /interviews`) para acompanhar as
entrevistas e acionar a decisão humana. No Docker Compose ela é servida por um
nginx em `http://localhost:5173`, origem que já está na allowlist de CORS da API.

> ⚠️ **Limitação conhecida:** apenas o *bundle* compilado está versionado — o
> código-fonte da SPA não faz parte deste repositório. Isso significa que a
> interface **não pode ser auditada, modificada nem recompilada** a partir de um
> clone. Ela é um artefato de conveniência para demonstrar a esteira, não um
> componente mantido do projeto.
>
> A API é a interface de contrato do sistema e é completamente utilizável sem a
> SPA (veja a validação de ponta a ponta abaixo e a documentação interativa em
> `http://localhost:8000/docs`). Publicar o código-fonte da interface — ou
> substituí-la por uma alternativa aberta — está em aberto como contribuição
> bem-vinda.

---

## 🧪 Validando o Fluxo de Ponta a Ponta

### 1. Disparando a Ingestão (Webhook)
```bash
curl -X POST http://127.0.0.1:8000/webhooks/recording \
  -H "Content-Type: application/json" \
  -d '{
    "recording_url": "data/synthetic/interview_python_pleno.wav",
    "job_id": "python_pleno",
    "external_id": "gravacao-001"
  }'
```
O webhook retorna HTTP `202 Accepted` com o ID da entrevista. `external_id` é a
chave de idempotência: um webhook reenviado com o mesmo valor retorna a
entrevista existente em vez de criar duplicata. Com `WEBHOOK_HMAC_SECRET`
definido, envie também o header `X-Webhook-Signature` (HMAC-SHA256 do corpo).

### 2. Consultando o Status da Entrevista
```bash
curl -H "X-API-Key: $API_KEY" http://127.0.0.1:8000/interviews/{INTERVIEW_ID}
```
Assim que o status atingir `aguardando_aprovacao`, a notificação terá sido
disparada com links de decisão de uso único. Se o processamento falhar, o
status fica `falhou` com o erro em `error_log`.

### 3. Decisão Humana
Pelos botões da notificação (link GET com token de uso único), ou via API:
```bash
curl -X POST http://127.0.0.1:8000/interviews/{INTERVIEW_ID}/action \
  -H "Content-Type: application/json" -H "X-API-Key: $API_KEY" \
  -d '{"action": "approve"}'
```

### 4. Operação
```bash
curl http://127.0.0.1:8000/health                                  # liveness de DB e Redis
curl -X POST -H "X-API-Key: $API_KEY" \
  http://127.0.0.1:8000/interviews/{INTERVIEW_ID}/reprocess        # reprocessa entrevista 'falhou'
curl -X POST -H "X-API-Key: $API_KEY" \
  http://127.0.0.1:8000/admin/reconcile                            # re-enfileira 'recebida' órfãs
python -m app.maintenance                                          # reconciliação + retenção via cron
```

---

## 🎙️ Transcrição & Diarização — Provedores

A etapa de transcrição/diarização é plugável via `TRANSCRIPTION_PROVIDER`:

| Provider | Transcrição | Diarização | Requisitos | Custo (~1h de áudio) | Tempo (~1h de áudio) |
|---|---|---|---|---|---|
| `deepgram` (**default**) | Deepgram nova-3 (API) | **Nativa, na mesma chamada** | `DEEPGRAM_API_KEY` | ~US$ 0,31 (`multi`) | ~1–2 min |
| `local` | WhisperX (CPU/GPU) | pyannote.audio | `requirements-ml.txt` + `HF_TOKEN` | zero (compute próprio) | ~15 min+ em CPU |
| `openai` | whisper-1 (API) | pyannote.audio (local) | `OPENAI_API_KEY` + ML local + `HF_TOKEN` | ~US$ 0,36 + compute | híbrido |

No modo `deepgram`, os segmentos já chegam rotulados por speaker (`SPEAKER_00`,
`SPEAKER_01`, ... — mesmo formato do pyannote) e a etapa `DIARIZANDO` da esteira
vira um passthrough: a detecção é feita **pelos dados persistidos** (segmentos com
chave `speaker`), então entrevistas retomadas após troca de provider se comportam
corretamente. O worker também dispensa whisperx/pyannote/HF_TOKEN no startup
nesse modo.

**Gotchas do provider `deepgram` (aprendidos empiricamente):**
- `DEEPGRAM_LANGUAGE` é obrigatório: o default da Deepgram é inglês e, com
  idioma errado, a API retorna transcript **vazio** (e cobra mesmo assim).
- Use `multi` (code-switching, default deste repo), não `pt`: o modo monolíngue
  derruba/mangla os termos técnicos em inglês embutidos na fala ("queries",
  "deploy", "pull request", "GitHub"...), que são exatamente o vocabulário de que
  o scoring e o validador de evidências dependem. O `multi` custa ~20% mais e
  preserva a grande maioria deles.
- O OpenRouter tem endpoint de transcrição (`/api/v1/audio/transcriptions`) que
  serve o nova-3, mas o schema normalizado dele **descarta os labels de speaker**
  — por isso o provider fala com a API da Deepgram diretamente.

**Validação com áudio real:** o provider foi validado contra uma entrevista
técnica real de 53 min em pt-BR ([Desenvolvedor Jr | Simulação de entrevista
Técnica — Mate academy Brasil](https://www.youtube.com/live/KPqLBNXewUQ)):
transcrição + diarização em 68s (~US$ 0,28), 3 speakers detectados corretamente
(apresentador, entrevistador, candidato) e termos técnicos (JavaScript, React,
async/await, promises, deploy...) preservados. O áudio **não é versionado no
repositório** (conteúdo de terceiros); para reproduzir o teste, baixe a trilha
localmente, por exemplo com `yt-dlp -f 139 -o entrevista.m4a <url>`, e envie o
arquivo pelo webhook de ingestão como qualquer outra gravação.

---

## 📊 Relatório de Benchmark WER

Compara a taxa de erro de palavra (WER) e a preservação de termos técnicos
(code-switching PT-EN) entre os provedores, **executando-os de verdade**:

```bash
# Todos os provedores disponíveis
python scripts/run_benchmark.py

# Ou escolhendo quais comparar
python scripts/run_benchmark.py --providers deepgram local
```

O relatório é salvo em `docs/reports/benchmark_wer_report.md`. Provedores sem
dependência ou chave configurada são listados como **pulados**, com o motivo —
o relatório nunca contém números simulados.

> ⚠️ Os áudios em `data/synthetic/*.wav` **não são versionados** (são pesados e
> regeneráveis). Gere-os antes de rodar o benchmark:
> ```bash
> python scripts/generate_synthetic.py
> ```
> Um `.wav` local sobrando de um diálogo antigo invalida silenciosamente o WER;
> o script detecta essa inconsistência e avisa.

---

## 🩺 Executando a Suíte de Testes

Os mesmos gates aplicados pelo CI:

```bash
ruff check .                                    # lint
mypy                                            # verificação de tipos
pytest                                          # suíte completa
pytest --cov=app --cov-report=term-missing --cov-fail-under=78
pip-audit -r requirements.txt --strict          # vulnerabilidades conhecidas
```

A suíte roda **sem** os backends de ML (`requirements-ml.txt`): as dependências
pesadas são simuladas de forma determinística. Os testes de integração em
`tests/test_integration_e2e.py` exigem Postgres e Redis no ar e que o worker de
produção esteja parado — veja o [CONTRIBUTING.md](CONTRIBUTING.md).
