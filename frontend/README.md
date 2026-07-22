# Frontend — Scorecard Pipeline

SPA de revisão de scorecards de entrevistas. É um **painel de acompanhamento da
esteira**: mostra em que estágio cada entrevista está, destaca as que precisam
de decisão humana (`aguardando_aprovacao`) ou de reprocessamento (`falhou`), e
deixa uma pessoa revisar o scorecard e aprovar/rejeitar.

Stack: **React + TypeScript + Vite**. Consome a API FastAPI do repositório
(`app/main.py`).

## Pré-requisitos

- Node 20+ (desenvolvido com Node 24, npm 11).
- A API do backend rodando (padrão `http://localhost:8000`). Para o modo de
  desenvolvimento, o dev server **precisa** rodar na porta `5173`, porque a
  allowlist de CORS do backend (`app/main.py`) só libera
  `http://localhost:5173` e `http://127.0.0.1:5173`.

## Comandos

```bash
cd frontend
npm install        # instala dependências (parte do zero; node_modules não é versionado)
npm run dev        # dev server em http://localhost:5173
npm run build      # type-check + build de produção em frontend/dist/
npm run preview    # serve o build de dist/ localmente
npm test           # testes (Vitest); use `npm test -- --run` para rodar uma vez
npm run typecheck  # tsc --noEmit (sem gerar arquivos)
```

O build sai em `frontend/dist/` com `base: './'`, então funciona servido pelo
nginx (`frontend/nginx.conf`) em qualquer path. `dist/` e `node_modules/` são
gerados e **não** entram no git (ver `frontend/.gitignore`).

## Configuração em runtime

Não há URL nem chave embutidas no bundle. No cabeçalho, em **Configuração**, o
usuário define a **URL da API** e a **X-API-Key**; ambas ficam no
`localStorage` do navegador. Em modo dev (backend sem `API_KEY`), a chave pode
ficar vazia.

## Estrutura

```
src/
  api/         camada de rede tipada, isolada dos componentes
    types.ts     tipos espelhando o contrato do backend
    client.ts    funções por endpoint (fetch nativo) + parsing de erro
    errors.ts    hierarquia de erros (API fora do ar / 401-403 / 404 / 400)
  config/      settings.ts — carga/salvamento do config no localStorage (puro)
  lib/         lógica pura e testável (fora dos componentes)
    status.ts    metadados de estágio, contagens, filtros, prioridade de ação
    transcript.ts normaliza transcription_raw/diarization_raw em turnos
    format.ts    datas e helpers de formatação
  hooks/       useConfig, usePolling (pausa quando a aba oculta), useHashRoute
  components/  UI compartilhada (Header, StatusBadge, HealthIndicator, ...)
  features/interviews/  telas e componentes do domínio (lista, detalhe, form,
               Scorecard, EvidenceBadge, Transcript, DecisionActions)
  test/        fixtures sintéticas para os testes
```

A lógica não-trivial (derivação de estágios, polling, normalização de
transcrição, parsing de erro) vive em módulos puros justamente para ser testada
sem montar componentes.

## `evidence_verified`

É o sinal mais importante da interface. Cada evidência do scorecard tem três
estados, visualmente distintos:

- `true` — verificada: a citação foi localizada na transcrição (estado calmo).
- `false` — **NÃO verificada**: a citação pode ser alucinação do modelo. Vira um
  alerta vermelho e alto (`role="alert"`), e a competência inteira ganha borda
  de destaque. Não é um ícone discreto: uma decisão de carreira depende disso.
- `null` — não verificada automaticamente (estado neutro, distinto de `false`).

## Testes

Vitest + Testing Library (ambiente jsdom). Cobrem, entre outros:

- renderização do scorecard, incluindo o caso `evidence_verified: false`;
- fluxo de decisão com confirmação e o **400** de status inválido;
- mapeamento de erros da API, incluindo **401/403** (chave inválida);
- derivação de estado da esteira (contagens e filtros por status);
- comportamento do polling (com timers falsos, sem depender de tempo real);
- formulário de nova entrevista, incluindo o caso **HMAC 401/403**.

```bash
npm test -- --run
```

## Decisões de dependência

Menos dependência = menos superfície de supply chain num projeto OSS. Cada
escolha:

- **`fetch` nativo** em vez de axios/react-query — a camada de rede é pequena e
  não justifica uma dependência.
- **Sem biblioteca de roteamento** — um roteador por hash caseiro
  (`useHashRoute`) cobre as três telas, sobrevive a refresh sem depender de
  reescrita no servidor e não adiciona dependência.
- **Sem biblioteca de estado** — `useState`/`useCallback` bastam; a lógica
  derivada mora em funções puras em `src/lib`.
- **Sem ESLint** — o gate de qualidade aqui é o TypeScript em modo `strict`
  (`noUnusedLocals`/`noUnusedParameters` ligados) via `npm run typecheck`.
  Evita arrastar o toolchain do ESLint + plugins. Pode ser adicionado depois se
  o time quiser um `lint` dedicado.
- Runtime: `react` + `react-dom`. Dev: `vite`, `@vitejs/plugin-react`,
  `typescript`, `vitest`, `jsdom`, `@testing-library/*`.

## CI (sugestão)

O CI atual (`.github/workflows/ci.yml`) cobre só o backend Python. Sugestão de
job para o frontend (a cargo da orquestração do repositório):

```yaml
  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run typecheck
      - run: npm test -- --run
      - run: npm run build
```
