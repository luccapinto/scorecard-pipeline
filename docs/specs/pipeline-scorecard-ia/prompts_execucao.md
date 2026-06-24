# Prompts de Execução — Pipeline de Scorecard de Entrevistas com IA

Estes prompts estão estruturados e prontos para serem copiados e colados ao iniciar o desenvolvimento com agentes executores para cada milestone.

---

## 🚀 Milestone 1 — Infraestrutura Base & Dados Sintéticos

```text
Você vai implementar o "Milestone 1 — Infraestrutura Base & Dados Sintéticos" do entregável "pipeline-scorecard-ia".

ANTES DE CODAR:
1. Leia o README em docs/specs/pipeline-scorecard-ia/README.md.
2. Abra os arquivos dos cards:
   - docs/specs/pipeline-scorecard-ia/milestone-1-infra-dados/1.1-docker-postgres-estado.md
   - docs/specs/pipeline-scorecard-ia/milestone-1-infra-dados/1.2-dados-sinteticos.md
3. Atualize o status dos cards de [ ] para [/] Em Progresso nos cards e no README.md, e faça um commit de status (ex: docs(specs): start milestone 1).

TAREFA:
1. Configure o docker-compose.yml contendo PostgreSQL e Redis.
2. Crie os modelos de banco de dados (SQLAlchemy ou SQLModel) mapeando o estado de Entrevista.
3. Desenvolva o script CLI em Python para gerar arquivos JSON de contexto de vaga e o pipeline de geração de áudio TTS multi-voz contendo termos em inglês (code-switching).
4. Garanta que todos os testes sejam criados e executados localmente (pytest). Não declare vitória sem rodar a suíte e vê-la 100% verde.

APÓS CONCLUIR:
1. Mude o status dos cards para [x] Concluído nos respectivos arquivos e no README.md.
2. Faça o commit final das alterações e relate o resultado da execução dos testes.
```

---

## 🚀 Milestone 2 — API de Ingestão & Processamento de Fila

```text
Você vai implementar o "Milestone 2 — API de Ingestão & Processamento de Fila" do entregável "pipeline-scorecard-ia".

ANTES DE CODAR:
1. Leia o README em docs/specs/pipeline-scorecard-ia/README.md.
2. Abra os arquivos dos cards:
   - docs/specs/pipeline-scorecard-ia/milestone-2-ingestao-fila/2.1-fastapi-webhook-estado.md
   - docs/specs/pipeline-scorecard-ia/milestone-2-ingestao-fila/2.2-worker-rq-resiliencia.md
3. Atualize o status dos cards de [ ] para [/] Em Progresso nos cards e no README.md, e faça um commit de status (ex: docs(specs): start milestone 2).

TAREFA:
1. Desenvolva a aplicação FastAPI expondo o endpoint POST de webhook /webhooks/recording e GET de consulta.
2. Configure a infraestrutura do Redis Queue (RQ) com worker ativo processando jobs em background.
3. Implemente a função de orquestração process_interview com o mecanismo de resiliência e retomada a partir do último estado persistido no PostgreSQL.
4. Garanta que todos os testes sejam criados e executados localmente (pytest). Não declare vitória sem rodar a suíte e vê-la 100% verde.

APÓS CONCLUIR:
1. Mude o status dos cards para [x] Concluído nos respectivos arquivos e no README.md.
2. Faça o commit final das alterações e relate o resultado da execução dos testes.
```

---

## 🚀 Milestone 3 — Transcrição e Diarização

```text
Você vai implementar o "Milestone 3 — Transcrição e Diarização" do entregável "pipeline-scorecard-ia".

ANTES DE CODAR:
1. Leia o README em docs/specs/pipeline-scorecard-ia/README.md.
2. Abra os arquivos dos cards:
   - docs/specs/pipeline-scorecard-ia/milestone-3-audio-processamento/3.1-transcricao-diarizacao.md
   - docs/specs/pipeline-scorecard-ia/milestone-3-audio-processamento/3.2-benchmark-wer.md
3. Atualize o status dos cards de [ ] para [/] Em Progresso nos cards e no README.md, e faça um commit de status (ex: docs(specs): start milestone 3).

TAREFA:
1. Crie o motor pluggable de transcrição, suportando local (WhisperX) e API (OpenAI).
2. Integre o pyannote.audio para identificação de speakers (diarização).
3. Implemente a lógica de alinhamento e mesclagem temporal de transcrição e falantes (especialmente para OpenAI).
4. Desenvolva o script CLI de benchmark de WER (Word Error Rate) comparando os dois drivers em dados sintéticos com code-switching PT-EN e salvando o relatório Markdown.
5. Garanta que todos os testes sejam criados e executados localmente (pytest). Não declare vitória sem rodar a suíte e vê-la 100% verde.

APÓS CONCLUIR:
1. Mude o status dos cards para [x] Concluído nos respectivos arquivos e no README.md.
2. Faça o commit final das alterações e relate o resultado da execução dos testes.
```

---

## 🚀 Milestone 4 — Contexto, Motor de Scoring & Notificações

```text
Você vai implementar o "Milestone 4 — Contexto, Motor de Scoring & Notificações" do entregável "pipeline-scorecard-ia".

ANTES DE CODAR:
1. Leia o README em docs/specs/pipeline-scorecard-ia/README.md.
2. Abra os arquivos dos cards:
   - docs/specs/pipeline-scorecard-ia/milestone-4-scoring-notificacoes/4.1-contexto-scoring-engine.md
   - docs/specs/pipeline-scorecard-ia/milestone-4-scoring-notificacoes/4.2-notificacoes-callback.md
3. Atualize o status dos cards de [ ] para [/] Em Progresso nos cards e no README.md, e faça um commit de status (ex: docs(specs): start milestone 4).

TAREFA:
1. Implemente o ContextAggregator por leitura determinística local de JSONs de vagas.
2. Implemente o ScoringEngine consumindo OpenRouter com saída estruturada via schema Pydantic.
3. Desenvolva a validação pós-processamento de evidências literais contidas na transcrição (mitigação de alucinação).
4. Desenvolva o pipeline plugável de notificações, com adaptadores para Slack (Block Kit) e Webhook genérico.
5. Crie a rota FastAPI de callback /interviews/{interview_id}/action para aprovação/rejeição e finalização da máquina de estados.
6. Garanta que todos os testes sejam criados e executados localmente (pytest). Não declare vitória sem rodar a suíte e vê-la 100% verde.

APÓS CONCLUIR:
1. Mude o status dos cards para [x] Concluído nos respectivos arquivos e no README.md.
2. Faça o commit final das alterações e relate o resultado da execução dos testes.
```
