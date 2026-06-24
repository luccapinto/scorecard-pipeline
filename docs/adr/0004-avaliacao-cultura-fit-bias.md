# ADR 0004: Risco de Viés em Avaliação de Cultura e Mitigação por BARS & HITL

## Status
Aprovado

## Contexto
O conceito de "culture fit" (alinhamento cultural) na área de recursos humanos é frequentemente criticado por induzir vieses inconscientes. Ele tende a favorecer perfis semelhantes aos dos avaliadores existentes (reforçando homogeneidade) em detrimento da diversidade ("culture add"). Ao delegar avaliações a modelos de linguagem (LLMs), esses vieses e premissas implícitas presentes nos dados de treinamento podem ser amplificados.

## Decisão
Decidimos mitigar esses riscos e tratar o viés por meio de três salvaguardas de design fundamentais no pipeline:
1. **Âncoras Comportamentais Estritas (BARS):** A avaliação de cultura e comportamento não é subjetiva ("O candidato parece legal?"). Ela é mapeada em critérios BARS específicos com descrições objetivas de comportamento para cada pontuação (1 a 5).
2. **Exigência de Evidência Literal:** O LLM é forçado a extrair uma citação literal da transcrição da entrevista que sustente a nota atribuída. Se a citação não existir na transcrição (detectado pelo nosso validador programático pós-inferência), o sistema emite um alerta de alucinação.
3. **Validação Humana Mandatória (Human-in-the-Loop - HITL):** O pipeline nunca toma decisões automáticas de contratação ou avanço de etapa. Ele gera o scorecard prévio estruturado com os alertas de veracidade de evidência e o disponibiliza para que um avaliador humano (recrutador) revise, critique e aprove/rejeite a decisão.

## Consequências
### Prós:
- **Redução de Subjetividade:** Transforma avaliações vagas de "fit cultural" em métricas auditáveis baseadas estritamente em fatos ocorridos na conversa.
- **Transparência e Auditabilidade:** Toda avaliação gerada possui um rastro de evidências que permite ao recrutador contestar ou validar a nota sugerida pela IA.
- **Segurança Ética:** Mantém a responsabilidade final da decisão na figura humana, evitando a desumanização de processos seletivos por automação cega.

### Contras:
- **Sobrecarga de Revisão:** Exige uma etapa manual obrigatória de aprovação (callback), o que adiciona latência humana ao processo final da esteira.
- **Complexidade de Engenharia de Prompt:** Exige prompts muito mais descritivos e detalhados para orientar o LLM a seguir rigidamente a escala BARS sem inventar comportamentos.
