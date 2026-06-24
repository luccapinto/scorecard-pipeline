# Entregável: Pipeline de Scorecard de Entrevistas com IA

> Especificações SDD (Spec Driven Development). Leia este README antes de iniciar qualquer card.

## Proposta de Valor
A avaliação estruturada de entrevistas de recrutamento (scorecards) costuma ser manual, demorada e inconsistente entre avaliadores. Este projeto automatiza o processamento de entrevistas por meio de uma pipeline baseada em eventos. A entrevista é gravada, seu áudio é transcrito e diarizado (separando quem fala o quê), e uma IA avalia o candidato com base em critérios de competência bem estabelecidos e em evidências retiradas diretamente da transcrição da conversa. Isso garante avaliações rápidas, estruturadas, auditáveis e consistentes, com validação e aprovação humana final no loop.

## Estado Atual & Stack (Contexto)
O repositório está atualmente vazio, iniciando do zero. A stack adotada será:
- **Linguagem/Framework:** Python + FastAPI
- **Fila de processamento:** Redis + RQ (Redis Queue)
- **Persistência de estado:** PostgreSQL + SQLAlchemy / SQLModel
- **Transcrição:** WhisperX (local, padrão) ou OpenAI API (alternativa configurável)
- **Diarização:** pyannote.audio (requer Hugging Face Token)
- **LLM de scoring:** OpenRouter (retornando schema Pydantic validado)
- **Notificação:** Interface plugável (Slack / Webhook genérico)

## Convenções de Desenvolvimento (IA)
- **Status:** Atualize o status no README e no card para `[/] Em Progresso` ao começar e para `[x] Concluído` ao finalizar.
- **Testes:** Todo card de código exige testes automatizados criados, executados e passando (`pytest`).
- **Branch:** `tipo/slug-curto`.

---

## Índice de Milestones

| Milestone | Card | Tag | Status | Arquivo |
|---|---|---|---|---|
| **1. Infra & Dados Sintéticos** | 1.1 Docker Compose, Postgres e Estado | 🤖 | [x] | [1.1-docker-postgres-estado.md](milestone-1-infra-dados/1.1-docker-postgres-estado.md) |
| | 1.2 Pipeline de Dados Sintéticos (TTS + LLM) | 🤖 | [x] | [1.2-dados-sinteticos.md](milestone-1-infra-dados/1.2-dados-sinteticos.md) |
| **2. API Ingestão & Fila** | 2.1 FastAPI Ingestão & Máquina de Estados | 🤖 | [ ] | [2.1-fastapi-webhook-estado.md](milestone-2-ingestao-fila/2.1-fastapi-webhook-estado.md) |
| | 2.2 Worker RQ & Resiliência de Estado | 🤖 | [ ] | [2.2-worker-rq-resiliencia.md](milestone-2-ingestao-fila/2.2-worker-rq-resiliencia.md) |
| **3. Transcrição & Diarização** | 3.1 Motor Transcrição e Diarização Pluggable | 🤖 | [ ] | [3.1-transcricao-diarizacao.md](milestone-3-audio-processamento/3.1-transcricao-diarizacao.md) |
| | 3.2 Script de Benchmark WER | 🤖 | [ ] | [3.2-benchmark-wer.md](milestone-3-audio-processamento/3.2-benchmark-wer.md) |
| **4. Scoring & Aprovação** | 4.1 Agregador Contexto & Scoring Engine | 🤖 | [ ] | [4.1-contexto-scoring-engine.md](milestone-4-scoring-notificacoes/4.1-contexto-scoring-engine.md) |
| | 4.2 Notificações e Callback Humano | 🧑 | [ ] | [4.2-notificacoes-callback.md](milestone-4-scoring-notificacoes/4.2-notificacoes-callback.md) |
