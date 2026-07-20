<!--
Obrigado pela contribuição! Preencha o que fizer sentido para a mudança.
PRs pequenos e focados são revisados muito mais rápido.
-->

## O que muda e por quê

<!-- Descreva o comportamento antes e depois. Se corrige um bug, explique a causa raiz. -->

Closes #

## Tipo de mudança

- [ ] Correção de bug (sem quebra de compatibilidade)
- [ ] Nova funcionalidade (sem quebra de compatibilidade)
- [ ] Mudança com quebra de compatibilidade (schema, API ou variáveis de ambiente)
- [ ] Documentação / infraestrutura

## Como foi testado

<!-- Comandos executados e o que você observou. Se tocou em transcrição ou
scoring, diga com qual provider e em qual áudio validou. -->

## Checklist

- [ ] `ruff check .` passa
- [ ] `pytest` passa localmente
- [ ] Testes cobrindo a mudança foram adicionados ou atualizados
- [ ] Documentação atualizada (README, `.env.example`, specs ou ADRs)
- [ ] Novas variáveis de ambiente foram adicionadas ao `.env.example`
- [ ] Migração Alembic incluída, se o schema mudou
- [ ] Nenhum segredo, chave de API ou dado pessoal de candidato no diff
