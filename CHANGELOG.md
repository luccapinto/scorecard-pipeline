# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado

- **Código-fonte do frontend** (`frontend/`): SPA React + TypeScript + Vite
  escrita do zero a partir do contrato da API, substituindo o bundle
  pré-compilado que era a única forma da interface existir no repositório.
  Funciona como painel da esteira: resumo por estágio com filtros, entrevistas
  que precisam de ação humana destacadas no topo, scorecard com alerta
  visual proeminente para evidências não verificadas (possível alucinação do
  LLM), transcrição separada por interlocutor, aprovação/rejeição com
  confirmação em duas etapas e reprocessamento de falhas. URL da API e
  `X-API-Key` configuráveis em runtime (localStorage) — nada embutido no
  build. 61 testes com Vitest + Testing Library; TypeScript `strict`; só
  `react` + `react-dom` como dependências de runtime.
- Especificação da reconstrução em `docs/specs/frontend-rewrite-prompt.md`,
  com o contrato real da API verificado empiricamente.
- `frontend/Dockerfile` multi-stage (Node → nginx): o Docker Compose agora
  constrói a SPA do source em vez de montar um bundle pré-existente — um
  clone novo sobe a interface sem passo manual.
- Job `frontend` no CI (typecheck, testes, build) e smoke test da imagem da
  SPA no job de Docker.
- Endpoint `GET /integrations` (protegido por `X-API-Key`): expõe o estado de
  configuração das integrações (Slack, webhook de notificação, transcrição,
  pontuação, HMAC e API key) para a tela de integrações da SPA. Retorna
  apenas booleanos e nomes de provider/modelo — nunca segredos, URLs ou
  caminhos, nem mascarados.
- **Interface de produto no frontend**, com dois modos explícitos na URL e
  nunca misturados (ver [ADR 0005](docs/adr/0005-dois-modos-api-e-demonstracao.md)):
  - **Modo API** (`#/...`), fonte de verdade. Onde o backend não modela algo
    — candidato como entidade, fases de funil, autoria de decisão, histórico
    de mensagens, âncoras BARS — a UI declara a ausência e explica o motivo,
    em vez de fabricar o dado.
  - **Modo demonstração** (`#/demo/...`), dataset sintético determinístico de
    18 entrevistas cobrindo os 8 status, servido inteiramente no navegador.
    **Nenhuma requisição sai da página**, garantia verificada por um teste que
    dirige a aplicação real com `fetch`, `XMLHttpRequest` e `sendBeacon`
    substituídos por espiões que lançam. Relógio ancorado (`?t=`) torna cada
    tela reproduzível pixel a pixel.
- Shell de aplicação: navegação lateral persistente, breadcrumb, alternância
  de modo e de tema visíveis, e novas rotas (`esteira`, `aprovacoes`,
  `integracoes`, `saude`, `configuracao`, `funil`), todas em hash router com
  deep link e refresh funcionando.
- Dashboard da esteira com métricas por período: tempo desde a última
  atualização, taxa de evidência verificada, distribuição de notas 1–5 e
  contagem de falhas. Gráficos em SVG próprio, cada um com tabela equivalente
  navegável por leitor de tela.
- Scorecard mostra o **texto da âncora BARS** correspondente à nota, não só o
  número, com a escala 1–5 completa sob demanda. Clicar na citação a localiza
  e destaca na transcrição; quando a evidência não é verificada, a interface
  mostra que a busca não encontrou e qual foi o trecho mais parecido.
- Verificação de citação no cliente (`src/lib/evidence.ts`): port da
  normalização de `app/text_utils.py::clean_text`, fixado contra a saída real
  do Python. É o que permite derivar — e não declarar — o
  `evidence_verified` do dataset de demonstração.
- Tela de integrações com prévia fiel do payload Slack Block Kit montado por
  `app/notifications.py`, incluindo o marcador de verificação por competência
  e a omissão dos botões quando não há token; JSON bruto sob demanda; e a
  forma do link de decisão com o token sempre marcado como não exposto.
- Fila de aprovação ordenada por espera, com o necessário para decidir visível
  sem abrir o item. Confirmação em duas etapas que nomeia o candidato e repete
  o alerta de evidência. **Sem aprovação em massa, por decisão de produto.**
- Simulador de webhook mostrando a requisição exata, a assinatura HMAC marcada
  como responsabilidade do servidor, a idempotência por `external_id` e o
  `202` explicado como aceite.
- Tema claro e escuro, ambos desenhados como paletas independentes, com
  `prefers-reduced-motion` respeitado e intervalo de polling configurável.
- Verificações automatizadas novas: contraste WCAG AA sobre os tokens nos dois
  temas (`npm run check:contrast`), auditoria axe-core em 10 telas × 2 temas
  (`npm run check:a11y`) e orçamento de bundle de 180 KB gzip
  (`npm run check:size`) — as três no job `frontend` do CI.
- Script reproduzível de screenshots (`frontend/scripts/screenshots.mjs`) e
  galeria em `docs/assets/`, gerada a partir do modo demonstração.

### Alterado

- `frontend/dist/` deixou de ser versionado: passa a ser gerado pelo build
  (localmente via `npm run build`, no Compose via multi-stage build).
- Camada de dados do frontend reorganizada atrás de uma fronteira única
  (`src/data/source.ts`): exatamente um módulo pode falar com a rede, e duas
  invariantes de arquitetura passaram a ser verificadas por teste — nenhum
  componente importa `api/client`, e nada fora de `demo/` importa do demo
  (que é carregado sob demanda e fica fora do bundle inicial).
- `GET /interviews` passa por uma projeção leve e memoizada antes de chegar às
  telas: linhas sem alteração preservam identidade e um poll sem novidade não
  re-renderiza a lista. Acima de 200 itens a lista é virtualizada.
- Um único loop de polling para toda a aplicação, em vez de um por tela, com
  anúncio via `aria-live` das mudanças de status vindas do poll.
- `frontend/README.md` atualizado: a seção "CI (sugestão)" descrevia um job
  que já existia desde a introdução do frontend.

- Diagramas da arquitetura dupla redesenhados: os estados da esteira
  (`TRANSCREVENDO`, `DIARIZANDO`) agora aparecem numa faixa própria,
  separados do trabalho executado dentro deles. No modo API o passo de
  diarização é marcado explicitamente como no-op, e o README explica por que
  o estado não é pulado.
- Dependências: pytest 9.1.1 + pytest-asyncio 1.4.0 (subidos em par, pois se
  fixam mutuamente), numpy 2.4.6, soundfile 0.14.0, setup-python v7,
  build-push-action v7.
- Dependabot agrupa `pytest` e plugins (majors inclusive), para que bumps
  interdependentes sejam propostos e validados juntos.

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
