# Guia de Contribuição

Obrigado por seu interesse em contribuir para o **Pipeline de Scorecard de
Entrevistas com IA**! Toda ajuda é bem-vinda.

Ao participar, você concorda em seguir o
[Código de Conduta](CODE_OF_CONDUCT.md).

---

## 🚀 Preparando o ambiente

```bash
# 1. Infra (Postgres + Redis) via Docker
docker compose up -d postgres redis

# 2. Ambiente virtual
python -m venv .venv
source .venv/bin/activate        # Linux/macOS
# .venv\Scripts\Activate.ps1     # Windows (PowerShell)

# 3. Dependências de desenvolvimento
pip install -r requirements-dev.txt

# 4. Hooks de pre-commit (opcional, mas recomendado)
pip install pre-commit && pre-commit install

# 5. Configuração e migrações
cp .env.example .env             # preencha as chaves necessárias
alembic upgrade head
```

Os backends de ML locais (`requirements-ml.txt`) só são necessários para
trabalhar em `TRANSCRIPTION_PROVIDER=local` — eles puxam torch e são pesados.
**A suíte de testes passa sem eles.**

---

## 🛠️ Fluxo de trabalho

Este projeto utiliza a metodologia **Spec Driven Development (SDD)**.

1. **Abra uma issue** antes de codar, para alinhar objetivos.
2. **Crie uma spec** para mudanças grandes: um markdown em `docs/specs/` com
   contexto e critérios de aceite. Decisões arquiteturais viram um ADR em
   `docs/adr/`.
3. **Crie uma branch** com prefixo claro:
   - `feat/slug` — nova funcionalidade
   - `fix/slug` — correção de bug
   - `docs/slug` — documentação
   - `chore/slug` — infraestrutura, dependências, tooling
4. **Escreva testes** para toda alteração de comportamento.
5. **Rode os checks localmente** (ver abaixo) antes de abrir o PR.
6. **Abra o Pull Request** para `main`, preenchendo o template. A esteira de
   CI precisa ficar verde.

### Mensagens de commit

Seguimos [Conventional Commits](https://www.conventionalcommits.org/pt-br/):

```
feat: adiciona provider X de transcrição
fix: corrige perda de speakers em áudio mono
docs: documenta variáveis do Deepgram
chore(deps): atualiza httpx para 0.28.1
```

---

## ✅ Checks locais

Os mesmos gates que o CI aplica:

```bash
ruff check .                     # lint
mypy                             # verificação de tipos
pytest                           # suíte completa
pytest --cov=app --cov-report=term-missing --cov-fail-under=78
pip-audit -r requirements.txt --strict   # vulnerabilidades conhecidas
```

**Testes de integração** (`tests/test_integration_e2e.py`) exigem Postgres e
Redis no ar e que o worker de produção esteja **parado** — ele compete pela
mesma fila RQ e rouba o job do teste:

```bash
docker stop scorecard-worker
pytest tests/test_integration_e2e.py
```

---

## 💡 Diretrizes de estilo

- **Tipagem:** anote assinaturas públicas; `mypy` roda no CI sobre `app/`.
  Use as convenções do Python 3.11+ (`list[str]`, `str | None`).
- **Async:** prefira `async def` em endpoints que fazem E/S de rede.
- **Erros nunca silenciosos:** falhas de APIs externas devem propagar com
  contexto (`raise ... from e`) para que o retry do worker as registre. Ao
  degradar comportamento de propósito, registre em log de forma explícita.
- **Configuração:** toda variável nova entra em `app/config.py` **e** no
  `.env.example`, com comentário explicando o efeito de deixá-la vazia.
- **Migrações:** mudanças de schema exigem uma revisão Alembic. O CI valida
  `upgrade → downgrade → upgrade`, então o downgrade precisa funcionar.

---

## 🔒 Segurança e dados de candidatos

- **Nunca** inclua chaves de API em commits, issues ou logs colados em PRs.
- **Nunca** inclua transcrições, áudios ou dados pessoais reais de candidatos
  no repositório ou em issues. Use o dataset sintético em `data/synthetic/`.
- Vulnerabilidades seguem o processo do [SECURITY.md](SECURITY.md) — não abra
  issue pública.
