# Frontend — Scorecard Pipeline

SPA de revisão de scorecards de entrevistas. Mostra em que etapa cada
entrevista está, o que precisa de decisão humana, e — o ponto central — deixa
**inescapável** quando o modelo citou uma frase que não existe na transcrição.

Stack: **React 19 + TypeScript + Vite**, Vitest + Testing Library. Consome a API
FastAPI do repositório (`app/main.py`).

**Demo pública:** <https://luccapinto.github.io/scorecard-pipeline/> — página
inicial, tour guiado de ~2 minutos e a demonstração completa, sem backend.

## Duas edições do mesmo código

Registradas no [ADR 0006](../docs/adr/0006-build-showcase-sem-modo-api.md).

| | Build normal | Build showcase |
| --- | --- | --- |
| Comando | `npm run build` → `dist/` | `npm run build:showcase` → `dist-showcase/` |
| Onde roda | docker compose, `npm run dev` | GitHub Pages |
| Modo API | sim | **não existe no bundle** |
| Modo demonstração | em `#/demo/...` | em todo lugar |
| `#/` abre | a esteira da API | a página inicial |

O showcase troca `__SHOWCASE__` por um literal em tempo de build
(`src/app/edition.ts`); o bundler apaga os ramos do modo API e os módulos que só
eles alcançavam. `npm run check:showcase` **prova** isso nos arquivos gerados:
varre o JS/HTML atrás de strings que só existem no modo API ("Bloqueado por
CORS", `X-API-Key`, a tela de configuração...) e de qualquer primitiva de rede, e
usa o build normal como controle. No showcase, links antigos do modo API
(`#/esteira`, `#/entrevistas/<id>`) abrem o equivalente da demonstração e
`#/configuracao` abre a página inicial.

## Os dois modos (build normal)

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

## Arquitetura de informação

- **Página inicial** (`#/` no showcase, `#/demo` no build normal): a proposta em
  uma frase, um caso real de citação inventada — lido do dataset e buscado de
  verdade na transcrição —, a esteira em seis passos, o problema, a engenharia e
  os links para código, README e ADRs.
- **Quatro destinos** no cabeçalho: **Esteira** (a esteira como quadro, da
  gravação à decisão), **Entrevistas**, **Decisões** (a fila de quem espera uma
  pessoa) e **Por dentro**.
- **Por dentro** agrupa as telas de engenharia: *Como funciona* (arquitetura do
  webhook à decisão, máquina de estados, ADRs, o que o CI cobra), *Ingestão*,
  *Slack e integrações*, *Saúde*, *Funil* e — só no build normal —
  *Configuração*.
- **Toda tela se explica** em uma linha abaixo do título.
- Tema e "Reiniciar demonstração" ficam num menu discreto no cabeçalho. A marca
  **Dados fictícios** fica em toda tela da demonstração e não some.

## Tour guiado

Nove passos sobre a interface real (`src/features/tour/`), seguindo uma
entrevista da chegada à decisão: a esteira → uma gravação chega → o
processamento etapa por etapa → o scorecard com a âncora BARS → a citação que não
existe, com o trecho mais parecido → a citação verificada marcada na transcrição →
a decisão humana em duas etapas → a mensagem no Slack → por trás do produto.

- **Spotlight** com quatro bloqueadores em volta do alvo: o resto da página fica
  escuro e inerte, o alvo continua clicável ("Pode testar" vale).
- **Coachmark** é um `role="dialog"` modal: o foco vai para o título a cada
  passo, Tab circula dentro dele, **←/→** navegam, **Esc** sai. Cada passo é
  anunciado por `aria-live`. No celular vira uma folha fixa no rodapé.
- **O passo mora na URL** (`?tour=N`). Voltar do navegador volta o tour, e
  qualquer passo abre direto — é o que usam os screenshots, a auditoria axe e os
  testes. Antes de mostrar um passo, a demonstração garante que a entrevista de
  que ele fala já existe e já chegou na etapa certa, construída na hora e de forma
  pura (nada de esperar animação).
- Sair guarda o lugar em `localStorage`; o cabeçalho e a página inicial oferecem
  **Retomar**.

### Determinismo do demo

O dataset é uma função pura de `(âncora de relógio, ações)`. Não há `Date.now()`
nem gerador aleatório. Sem parâmetro na URL a âncora é o instante do
carregamento, então as datas são relativas ao agora; com `?t=<epoch-ms>` a
âncora é fixa e a mesma URL produz sempre a mesma tela — é isso que torna o
script de screenshots e os testes de UI reproduzíveis.

**Simular nova entrevista** substitui o antigo "Avançar esteira · passo N": uma
gravação roteirizada entra pelo webhook e atravessa as etapas uma de cada vez,
deslizando entre as colunas (View Transitions quando o navegador tem), até parar
na decisão humana. Nada se move sem uma pessoa pedir; o que espaça os passos é
um temporizador na interface que despacha ações `step` comuns — o reducer
continua puro. Com `prefers-reduced-motion`, o intervalo encurta e a animação
some. Reprocessar uma falha retoma a caminhada do mesmo jeito. Toda entrevista
simulada traz uma citação que a pessoa não disse (é roteiro, em
`src/demo/dataset.ts`); o alarme continua derivado da busca na transcrição.

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
- O modo demonstração e o build showcase não precisam de backend nenhum.

## Comandos

```bash
cd frontend
npm install              # instala dependências
npm run dev              # dev server em http://localhost:5173
npm run build            # type-check + build normal (API + demonstração) em frontend/dist/
npm run build:showcase   # type-check + build showcase (só demonstração) em frontend/dist-showcase/
npm run preview          # serve dist/ (porta 4173)
npm run preview:showcase # serve dist-showcase/ (porta 4173)
npm test                 # Vitest em watch; use `npm test -- --run` para uma passada
npm run typecheck        # tsc --noEmit

npm run check:contrast   # WCAG AA sobre os tokens, nos dois temas
npm run check:size       # orçamento de bundle (gzip) sobre dist/ e dist-showcase/
npm run check:showcase   # prova que o modo API não está no bundle showcase
npm run check:a11y       # axe-core em todas as telas e passos do tour (precisa do preview;
                         # EDITION=showcase ao auditar o preview do showcase)
npm run screenshots      # regenera docs/assets a partir do preview do showcase;
                         # `-- --matrix <dir>` gera tudo em 1440, 1280, 390 e tema escuro
npm run demo-video       # grava o vídeo do README (desatualizado: será reescrito para a interface nova)
npm run build:demo-reference  # regenera o dataset de referência do demo
```

`dist/`, `dist-showcase/` e `node_modules/` são gerados e não entram no git.

## Configuração em runtime

Nada de URL ou chave embutidos no bundle. No build normal, em **Por dentro →
Configuração**, o usuário define a **URL da API** e a **X-API-Key**, guardadas no
`localStorage` deste navegador. O build showcase não tem essa tela.
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
  app/          routes.ts (rotas em hash, com o modo, o passo do tour e a citação
                destacada na URL), edition.ts (constante do build showcase), links.ts
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
  components/   shell (cabeçalho, navegação, menu), primitivos de UI e gráficos SVG
  features/     telas por domínio
    home/         página inicial
    tour/         passos (dados), estado na URL e spotlight
    inside/       "Por dentro": arquitetura e a navegação das telas técnicas
  styles/       tokens.css, base.css, layout.css, components.css, views.css
```

### Invariantes verificadas por teste

Três regras seguram o desenho, e as três são verificadas em
`src/data/isolation.test.ts` — erodiriam em silêncio se fossem só documentação:

1. **Só `data/apiSource.ts` importa `api/client`.**
2. **Nenhum outro módulo chama uma primitiva de rede.** A regra acima olha o
   grafo de imports, e sozinha não bastaria: um componente que escrevesse
   `fetch(url)` não importa nada e passaria por ela. Então o teste também
   varre o código-fonte (sem comentários) atrás de `fetch(`,
   `new XMLHttpRequest`, `new EventSource`, `new WebSocket`, `sendBeacon`,
   `serviceWorker` e `import()` de URL remota, permitindo-os apenas em
   `api/client.ts`.
3. **Nada fora de `demo/` importa de `demo/`**, exceto um `import()` dinâmico
   em `App.tsx`. É o que mantém o demo fora do bundle inicial.

E `src/demo/isolation.test.tsx` dirige a aplicação real com `fetch`,
`XMLHttpRequest.open` e `navigator.sendBeacon` substituídos por espiões que
lançam. A lista de rotas exercitadas é **derivada de `ROUTE_TITLES`**, não
escrita à mão: toda rota que o roteador conhece entra no teste sozinha, e uma
rota nova não escapa da garantia em silêncio. Além disso, os fluxos de escrita
— decisão, criação com deduplicação, reprocessamento e a simulação de uma nova
entrevista até a decisão humana — são exercitados individualmente, assim como a
página inicial, o tour inteiro clicando em "Próximo", cada passo aberto direto
pela URL, Esc/retomar e as setas — todos exigindo **zero** chamadas.

O projeto Vitest `showcase` (arquivos `*.showcase.test.tsx`) compila a aplicação
com a constante do build showcase ligada e testa o bundle público como ele é:
página inicial em `#/`, rotas da API viram demonstração, sem seletor de modo,
sem configuração, sem a taxonomia de erros da API.

O limite honesto: isso cobre o que o código-fonte faz. Não cobre um recurso
remoto referenciado por markup (um `<img src>` absoluto, por exemplo), que o
jsdom não busca. Hoje não existe nenhum, e a regra 2 é o que impede que
apareça por código.

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
e no CI para as duas edições. Hoje: **~119 KB** no build normal (JS + CSS + HTML
da rota inicial) e **~125 KB** no showcase. O showcase conta também o chunk do
modo demonstração, porque não mostra nada sem ele e todo visitante o baixa. No
build normal, o modo demonstração e o funil são chunks separados e não contam —
quem usa o modo API não baixa nenhum deles.

As **fontes** são auto-hospedadas (pacotes `@fontsource-variable`, empacotadas
pelo Vite): nada de Google Fonts ou CDN, que seria a primeira requisição de rede
da demonstração. O subconjunto latino das três famílias soma ~205 KB woff2 e fica
fora do orçamento de propósito: é comprimido de origem, carrega sob demanda com
`font-display: swap` e não bloqueia a primeira pintura. O `check:size` imprime
esse número para ele não sumir de vista.

## Acessibilidade

Requisito funcional, não acabamento: esta é uma interface de decisão sobre
pessoas.

- `npm run check:a11y` roda **axe-core** (WCAG 2.1 A e AA) contra o app
  buildado, em **todas as telas e nos 9 passos do tour × 2 temas** — 44
  combinações no build normal, 42 no showcase (que não tem a tela de
  configuração). Roda num navegador de verdade porque as regras que mais
  importam aqui — contraste, ordem de foco, nome acessível sobre layout
  renderizado — não funcionam sob jsdom.
- `npm run check:contrast` confere os pares de cor direto nos tokens, nos dois
  temas, antes mesmo de existir um pixel.
- Informação nunca depende só de cor: `evidence_verified` e o status combinam
  ícone, texto e posição.
- Mudanças de status vindas do polling são anunciadas por `aria-live`
  (`components/ui/Announcer`). Uma tela que muda sozinha sem anunciar é hostil
  a leitor de tela.
- Todo gráfico SVG tem tabela equivalente, navegável célula a célula, em vez de
  um `aria-label` resumido.
- `prefers-reduced-motion` desliga animação, a rolagem suave do tour e as
  transições da simulação. A animação de entrada da página inicial mexe só nos
  fios e ícones: o texto está com contraste total desde o primeiro quadro.
- O tour é navegável só por teclado (←/→, Esc, Tab preso no coachmark) e
  anuncia cada passo por `aria-live`; o foco volta para onde estava ao sair.
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

Vitest + Testing Library (jsdom). **301 testes**, em dois projetos: `app` (o
build normal) e `showcase` (a aplicação compilada com a constante do build
público ligada).

```bash
npm test -- --run --maxWorkers=2   # poucos workers: a suíte sobe a app inteira várias vezes
```

Cobrem, entre outros: `evidence_verified` nos três estados; o fluxo de decisão
completo, com confirmação nominal, o 400 de status inválido e **o rollback
visível da atualização otimista**; parsing tolerante de
`scorecard`/`transcription_raw` duplo-codificados e de transcrição em texto
plano; 401/403 com mensagem de chave; **idempotência (`deduplicated: true`)
exercitada pela própria tela de ingestão**; **reprocessamento a partir de
`falhou`, verificando a transição e o incremento de `retry_count`**; o
isolamento de rede do modo demo; o parse de todas as rotas nos dois modos; as
contagens e filtros da esteira; **a virtualização acima de 200 linhas**; a
página inicial; **o tour inteiro e cada passo aberto direto pela URL**; e o
comportamento do build showcase.

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

**Dependências de runtime:** `react`, `react-dom` e três pacotes de fonte
(`@fontsource-variable/newsreader`, `/schibsted-grotesk`, `/jetbrains-mono`).
Os pacotes de fonte não têm código: são arquivos woff2 e um CSS de
`@font-face`, auto-hospedados no bundle porque a demonstração não pode fazer
requisição a um CDN. Fora isso, nada foi adicionado — o que faria falta não
valia o custo:

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
- **Biblioteca de ícones**: ~35 glifos, cada um um `<path d>`.
- **Biblioteca de tour** (react-joyride, shepherd, driver.js): o tour precisa
  morar na URL, preparar o estado puro da demonstração antes de cada passo e
  seguir um alvo que se move entre colunas; ~600 linhas próprias em
  `features/tour/` (metade delas o posicionamento do spotlight) fazem isso sem
  um segundo modelo de foco e de acessibilidade.
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
contraste dos tokens, testes, build normal, build showcase, `check:showcase`,
orçamento de bundle das duas edições e auditoria axe contra os dois builds
servidos. O deploy do Pages (`.github/workflows/pages.yml`) repete o
`check:showcase` antes de publicar `dist-showcase/`.
