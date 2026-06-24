# ADR 0002: Lookup Determinístico de Contexto vs. RAG (Retrieval-Augmented Generation)

## Status
Aprovado

## Contexto
O motor de scoring precisa comparar a conversa da entrevista com três insumos estruturados: a Descrição da Vaga (`JobDescription`), a escala comportamental (`CompetencyFramework` BARS) e os itens específicos de avaliação (`EvaluationChecklist`). Precisamos escolher o método de recuperação desses contextos para injetá-los no prompt do LLM.

## Decisão
Decidimos utilizar um **lookup determinístico baseado em sistema de arquivos locais** (arquivos JSON associados ao ID da vaga) em vez de busca semântica vetorial (RAG).

Dado que o contexto completo de uma vaga e a transcrição consolidada de uma entrevista (tipicamente de 30 a 60 minutos) cabem perfeitamente dentro da janela de contexto dos modelos LLM modernos (como Claude 3.5 Sonnet, GPT-4o ou Gemini 1.5 Pro, acessados via OpenRouter), não há necessidade de particionar e buscar trechos de forma semântica.

## Consequências
### Prós:
- **Previsibilidade e Consistência (100% de Cobertura):** Garantimos que todas as competências BARS e todos os itens do checklist são avaliados pelo LLM. No RAG, a etapa de recuperação vetorial poderia omitir critérios importantes por baixa similaridade de palavras-chave.
- **Simplicidade de Arquitetura:** Sem necessidade de manter uma Vector Database (ex: PGVector, Chroma, Pinecone) ou pipelines complexos de chunking e embedding.
- **Auditoria Facilitada:** É fácil reproduzir o prompt exato enviado ao LLM para depuração.

### Contras:
- **Custo de Token de Entrada:** Como enviamos todo o checklist e a transcrição integral no prompt, o volume de tokens de entrada é maior do que em uma abordagem RAG filtrada. Contudo, a precisão e a confiabilidade da avaliação superam este trade-off financeiro.
