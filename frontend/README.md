# Frontend — Scorecard Pipeline

SPA de revisão de scorecards de entrevistas. Mostra em que estágio cada
entrevista está, destaca o que precisa de decisão humana, e — o ponto central —
deixa **inescapável** quando o modelo citou uma frase que não existe na
transcrição.

Stack: **React 19 + TypeScript + Vite**, Vitest + Testing Library. Consome a API
FastAPI do repositório (`app/main.py`).

## Os dois modos

A interface roda em dois modos, explícitos na URL e nunca misturados. A decisão
e o raciocínio completo estão no [ADR 0005](../docs/adr/0005-dois-modos-api-e-demonstracao.md).

| | **API** (`#/...`) | **Demonstração** (`#/demo/...`) |
| --- | --- | --- |
| Origem dos dados | a API real | dataset sintético, no navegador |
| Rede | requisições normais | **nenhuma**, em nenhum fluxo |
| Onde a API não tem resposta | declara a ausência e explica por quê | encena, rotulado como sintético |
| Escritas | tocam a API | nunca saem do navegador |

O modo mora na rota porque um link compartilhado precisa abrir no mesmo modo —
uma flag em `localStorage` não atravessa navegadores.

**O que só existe no modo demonstração**, porque o backend não modela: funil de
candidatos, trilha de auditoria de decisão, histórico de entrega de
notificações e o texto das âncoras BARS. No modo API cada um desses pontos
aparece como uma ausência declarada, com uma linha explicando o motivo.

### Determinismo do demo

O dataset é uma função pura de `(âncora de relógio, ações)`. Não há `Date.now()`
nem gerador aleatório. Sem parâmetro na URL a âncora é o instante do
carregamento, então as datas são relativas ao agora; com `?t=<epoch-ms>` a
âncora é fixa e a mesma URL produz sempre a mesma tela — é isso que torna o
script de screenshots e os testes de UI reproduzíveis.

Nada se move sozinho: o botão **Avançar esteira** dá um passo no relógio
virtual. Em um projeto sobre não fingir, um passo explícito vale mais que um
timer.

### A verificação de evidência é real, inclusive no demo

`evidence_verified` não é escrito à mão no dataset sintético: é **derivado**.
`src/lib/evidence.ts` porta a normalização de `app/text_utils.py::clean_text` e
procura a citação na transcrição. Uma citação sinalizada no demo está
sinalizada porque de fato não está no texto. O port é fixado contra a saída real
do Python em `src/lib/evidence.test.ts`.

## Pré-requisitos

- Node 20+ (desenvolvido com Node 24).
- Para o modo API, o backend rodando (padrão `http://localhost:8000`). O dev
  server **precisa** ficar na porta `5173`: a allowlist de CORS em
  `app/main.py` só libera `http://localhost:5173` e `http://127.0.0.1:5173`.
- O modo demonstração não precisa de backend nenhum.

## Comandos

```bash
cd frontend
npm install              # instala dependências
npm run dev              # dev server em http://localhost:5173
npm run build            # type-check + build de produção em frontend/dist/
npm run preview          # serve o build de dist/ (porta 4173)
npm test                 # Vitest em watch; use `npm test -- --run` para uma passada
npm run typecheck        # tsc --noEmit

npm run check:contrast   # WCAG AA sobre os tokens, nos dois temas
npm run check:size       # orçamento de bundle (gzip) sobre o build
npm run check:a11y       # axe-core no app buildado (precisa do preview no ar)
npm run screenshots      # regenera as imagens de docs/assets (precisa do preview)
npm run build:demo-reference  # regenera o dataset de referência do demo
```

`dist/` e `node_modules/` são gerados e não entram no git.

## Configuração em runtime

Nada de URL ou chave embutidos no bundle. Em **Configuração** o usuário define a
**URL da API** e a **X-API-Key**, guardadas no `localStorage` deste navegador.
A chave nunca aparece em log, em URL, em mensagem de erro ou na telemetria —
`src/api/telemetry.ts` registra deliberadamente só o *path* da requisição.

## Estrutura

```
src/
  api/          camada de rede tipada, isolada dos componentes
    types.ts      tipos espelhando o contrato do backend
    client.ts     funções por endpoint (fetch nativo)
    errors.ts     hierarquia de erros
    normalize.ts  parsing tolerante (JSON duplo-codificado, texto plano)
    telemetry.ts  tempo da última requisição — só o path, nunca cabeçalhos
  app/          routes.ts — rotas em hash, com o modo embutido na URL
  config/       settings.ts (API) e preferences.ts (tema, polling)
  data/         a fronteira única de dados
    source.ts       interface DataSource + capabilities + textos das lacunas
    apiSource.ts    implementação sobre a API real
    demoControls.ts contrato dos controles do demo (fica fora de demo/)
    InterviewsProvider.tsx  um único loop de polling para o app inteiro
  demo/         dataset sintético, reducer e fonte de dados (carregado sob demanda)
  lib/          lógica pura e testável
    evidence.ts   localiza a citação na transcrição (port de clean_text)
    projection.ts projeção leve e memoizada sobre GET /interviews
    metrics.ts    agregados da esteira
    status.ts, transcript.ts, format.ts
  components/   shell, primitivos de UI e gráficos SVG próprios
  features/     telas por domínio
  styles/       tokens.css, base.css, layout.css, components.css, views.css
```

### Invariantes verificadas por teste

Duas regras seguram o desenho, e as duas são verificadas em
`src/data/isolation.test.ts` — erodiriam em silêncio se fossem só documentação:

1. **Só `data/apiSource.ts` importa `api/client`.** Se um componente acessar a
   rede direto, a garantia do demo deixa de valer.
2. **Nada fora de `demo/` importa de `demo/`**, exceto um `import()` dinâmico
   em `App.tsx`. É o que mantém o demo fora do bundle inicial.

E `src/demo/isolation.test.tsx` dirige a aplicação real com `fetch`,
`XMLHttpRequest.open` e `navigator.sendBeacon` substituídos por espiões que
lançam, exigindo **zero** chamadas — inclusive no fluxo de decisão.

## Desempenho

`GET /interviews` devolve tudo, com transcrição e scorecard inteiros em cada
item. Três medidas:

- **Projeção na fronteira** (`lib/projection.ts`): cada entrevista vira um
  resumo leve. A identidade do objeto é preservada enquanto `updated_at` não
  muda, e a lista inteira devolve a *mesma instância* de array quando nada
  mudou — então um poll sem novidade não re-renderiza nada.
- **Um único loop de polling** para o app todo (`InterviewsProvider`), em vez
  de um por tela. Pausa com a aba oculta e faz refresh imediato ao voltar.
- **Virtualização acima de 200 linhas** (`components/ui/VirtualList`). Abaixo
  disso a lista renderiza inteira de propósito: janelar quebra o Ctrl+F
  nativo e a impressão.

### Orçamento de bundle

**≤ 180 KB gzip** no carregamento inicial, verificado por `npm run check:size`
e no CI. Hoje: **~98 KB** (JS + CSS + HTML da rota inicial). O modo
demonstração e o funil são chunks separados e não contam — quem usa o modo API
não baixa nenhum deles.

## Acessibilidade

Requisito funcional, não acabamento: esta é uma interface de decisão sobre
pessoas.

- `npm run check:a11y` roda **axe-core** (WCAG 2.1 A e AA) contra o app
  buildado, em **10 telas × 2 temas**. Roda num navegador de verdade porque as
  regras que mais importam aqui — contraste, ordem de foco, nome acessível
  sobre layout renderizado — não funcionam sob jsdom.
- `npm run check:contrast` confere os pares de cor direto nos tokens, nos dois
  temas, antes mesmo de existir um pixel.
- Informação nunca depende só de cor: `evidence_verified` e o status combinam
  ícone, texto e posição.
- Mudanças de status vindas do polling são anunciadas por `aria-live`
  (`components/ui/Announcer`). Uma tela que muda sozinha sem anunciar é hostil
  a leitor de tela.
- Todo gráfico SVG tem tabela equivalente, navegável célula a célula, em vez de
  um `aria-label` resumido.
- `prefers-reduced-motion` desliga animação e rolagem suave.
- Nenhum drag-and-drop: o funil move cartões por um `<select>` nativo, que todo
  método de entrada já dirige corretamente.

## Segurança

- Nenhum segredo no bundle; `X-API-Key` nunca em log, URL ou mensagem de erro.
- O token de decisão **não é redigido por política** — `serialize_interview`
  no backend o exclui de toda resposta, então a interface não tem como obtê-lo.
  A prévia mostra a forma da URL com um marcador explícito.
- Nenhum `dangerouslySetInnerHTML`. Transcrição e `error_log` vêm de áudio e de
  exceções: são entrada não confiável e só viram nós de texto.
- Nenhuma assinatura HMAC no cliente. Assinar exigiria o segredo no bundle;
  quando a ingestão responde 401, a UI explica isso em vez de tentar de novo.

## Testes

Vitest + Testing Library (jsdom). **242 testes.**

```bash
npm test -- --run
```

Cobrem, entre outros: `evidence_verified` nos três estados; o fluxo de decisão
completo, com confirmação nominal, o 400 de status inválido e **o rollback
visível da atualização otimista**; parsing tolerante de
`scorecard`/`transcription_raw` duplo-codificados e de transcrição em texto
plano; 401/403 com mensagem de chave; **idempotência (`deduplicated: true`)
exercitada pela própria tela de ingestão**; **reprocessamento a partir de
`falhou`, verificando a transição e o incremento de `retry_count`**; o
isolamento de rede do modo demo; o parse de todas as rotas nos dois modos; as
contagens e filtros da esteira; e **a virtualização acima de 200 linhas**.

Dois testes merecem destaque porque defendem afirmações que seriam fáceis de
exagerar:

- `src/features/integrations/blockKit.golden.test.ts` compara o payload Block
  Kit do cliente com um **fixture gerado executando o
  `SlackNotification.notify_scorecard` real do Python**. Hoje são idênticos,
  byte a byte, exceto pelo token — que o cliente não pode ter. Se divergirem, o
  Python está certo e a prévia está mentindo.
- `src/lib/evidence.test.ts` fixa o port de `clean_text` contra a saída real da
  função Python em 12 casos, incluindo o travessão, que **não** é pontuação
  para o backend.

## Decisões de dependência

**Nenhuma dependência de runtime foi adicionada.** Continuam apenas `react` e
`react-dom`. O orçamento permitia até três; o que faria falta não valia o custo:

- **Biblioteca de gráficos** (recharts, visx): ~40–90 KB gzip para desenhar
  cinco `<rect>` e um `<circle>` com `stroke-dasharray`. Além do peso, cada uma
  traz o próprio modelo de acessibilidade, e aqui a exigência é específica —
  tabela equivalente navegável, não `aria-label`. Feito à mão em
  `components/charts/`, ~200 linhas.
- **Roteador** (react-router): o roteador em hash já existia, precisa embutir o
  modo no caminho e não depende de reescrita no servidor.
- **Cliente HTTP / cache de servidor** (axios, TanStack Query): a camada de
  rede tem nove funções, e o cache que o app precisa é a projeção memoizada,
  que é específica demais para um cache genérico.
- **Biblioteca de ícones**: ~20 glifos, cada um um `<path d>`.
- **Framework de UI** (MUI, Chakra): impõe aparência de template, que é o
  oposto do objetivo.
- **Drag-and-drop acessível** (dnd-kit): a decisão foi não ter DnD.

Dependências de **desenvolvimento** adicionadas: `@types/node`, `playwright` e
`@axe-core/playwright` (auditoria de acessibilidade e screenshots). Nenhuma vai
para o bundle.

Sem ESLint: o gate é o TypeScript em modo `strict` com `noUnusedLocals` e
`noUnusedParameters`.

## CI

O job `frontend` em `.github/workflows/ci.yml` roda, nesta ordem: typecheck,
testes, contraste dos tokens, build, orçamento de bundle e auditoria axe contra
o build servido.
