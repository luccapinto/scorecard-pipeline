# Guia de Contribuição

Obrigado por seu interesse em contribuir para o **Pipeline de Scorecard de Entrevistas com IA**! Toda ajuda é muito bem-vinda para tornar este projeto ainda mais robusto.

Como este projeto utiliza a metodologia **Spec Driven Development (SDD)**, pedimos que siga os passos abaixo para submeter modificações.

---

## 🛠️ Fluxo de Trabalho de Desenvolvimento

1. **Abra uma Issue:** Antes de codar, discuta as alterações em uma issue para alinhar os objetivos e obter feedback.
2. **Crie uma Spec (Se necessário):** Para mudanças grandes ou novas features, crie um arquivo markdown de especificação sob `docs/specs/` detalhando o contexto e critérios de aceite antes de codar.
3. **Crie uma Branch:** Use convenções claras de branch:
   - `feat/slug-do-recurso` para novas funcionalidades.
   - `fix/slug-do-bug` para correção de problemas.
   - `docs/slug` para melhorias de documentação.
4. **Escreva Testes:** Toda alteração de código ou funcionalidade exige testes automatizados correspondentes no diretório `tests/`.
5. **Garanta que todos os testes passem:** Execute a suíte de testes localmente com o ambiente virtual ativo:
   ```bash
   $env:PYTHONPATH="."
   .venv\Scripts\pytest
   ```
6. **Submeta um Pull Request (PR):** Faça o push para o seu fork e abra o PR apontando para a branch `main` do repositório oficial. Certifique-se de que a esteira do GitHub Actions (CI) fique verde.

---

## 💡 Diretrizes de Estilo e Boas Práticas

- **Tipagem Estrita:** Utilize tipagem estática do Python (`typing`) e validação via Pydantic onde apropriado.
- **Async:** FastAPI suporta endpoints síncronos e assíncronos. Prefira `async def` para endpoints de rede e manipulações que envolvam E/S sem bloqueio.
- **Tratamento de Exceções:** Nunca deixe erros silenciosos. Trate falhas de APIs externas (como OpenAI e OpenRouter) de forma segura para não quebrar a esteira do worker.
