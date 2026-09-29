# ADR 0006: Demo pública sem modo API (build "showcase") e uma interface feita para quem chega de fora

## Status

Aprovado. Revisa dois pontos do [ADR 0005](0005-dois-modos-api-e-demonstracao.md)
(o banner de demonstração e o botão "Avançar esteira"); o resto dele continua
valendo.

## Contexto

A demo publicada no GitHub Pages é o que um recrutador vê — pelo README ou por
um post no LinkedIn. Três problemas apareceram nela:

1. **O modo API quebrava na frente do visitante.** O build publicado era o
   mesmo do docker compose. Clicar em "API" levava a `#/esteira`, que tentava
   falar com `http://localhost:8000` e caía na tela "Bloqueado por CORS".
   Para quem chega de fora, isso é um produto quebrado — e não existe backend
   público para ele usar, nem deveria existir.
2. **A interface parecia um painel de observabilidade.** Abria num dashboard de
   KPIs, com uma barra lateral de oito itens em três grupos, "Avançar esteira ·
   passo 0" no cabeçalho, um seletor de modo, três botões de tema e um banner
   amarelo grande. Nada dizia em dez segundos o que o projeto é.
3. **Não havia caminho.** O momento que importa — o modelo citou uma frase que
   não existe e o sistema pegou — estava a três cliques de distância, sem
   ninguém apontar para ele.

## Decisão

### 1. Duas edições do mesmo código, escolhidas em tempo de build

| | Build normal (`npm run build`) | Build showcase (`npm run build:showcase`) |
| --- | --- | --- |
| Onde roda | docker compose, `npm run dev` | GitHub Pages |
| Para quem | quem roda o backend | quem nunca vai rodar |
| Modo API | sim, com as regras do ADR 0005 | **não existe** |
| Modo demonstração | em `#/demo/...` | em todo lugar |
| `#/` abre | a esteira da API | a página inicial |

`vite build --mode showcase` troca `__SHOWCASE__` por um literal
(`vite.config.ts`, `src/app/edition.ts`). `App.tsx` escolhe a edição com
`SHOWCASE ? <ShowcaseApp /> : <FullApp />`; o bundler dobra a constante e
apaga o ramo que sobra — e com ele os módulos que só ele alcançava: cliente
HTTP, tela de configuração, seletor de modo, estado da API, diagnóstico de
CORS, painel de observabilidade ao vivo.

**Provado, não prometido**, em três camadas:

- `scripts/check-showcase-bundle.mjs` varre o JS e o HTML **construídos** atrás
  de strings que só existem nos módulos do modo API ("Bloqueado por CORS",
  `X-API-Key`, a chave de `localStorage` da configuração...) e de qualquer
  primitiva de rede (`fetch(`, `XMLHttpRequest`, `EventSource`, `WebSocket`,
  `sendBeacon`). Um controle confere que as mesmas strings **aparecem** no
  build normal, senão a varredura estaria cega. Roda no CI e no deploy do
  Pages, antes de publicar.
- O projeto Vitest `showcase` compila a aplicação com a constante ligada e
  testa o que o bundle público faz: rotas da API viram demonstração, não há
  seletor de modo nem configuração, a tela de saúde não traz a taxonomia de
  erros da API.
- O polyfill de `modulepreload` do Vite foi desligado (todo navegador alvo
  tem suporte nativo): era o único `fetch()` injetado, e sem ele o bundle
  showcase não contém chamada de rede nenhuma.

Uma flag de runtime foi rejeitada justamente por isso: esconderia o modo API e
continuaria entregando o código — e não haveria como provar a ausência.

### 2. Rotas no showcase

Tudo é demonstração. `#/` é a página inicial; os links já publicados
(`#/demo/esteira`, `#/demo/entrevistas/demo-bruno-exemplo`) continuam
funcionando; um link antigo do modo API (`#/esteira`, `#/entrevistas/<id>`)
abre o equivalente da demonstração em vez de um erro de CORS; `configuracao`
abre a página inicial.

### 3. Arquitetura de informação para quem chega de fora

- **Página inicial** com a proposta em uma frase, um caso real de citação
  inventada (lido do dataset e buscado de verdade na transcrição, não uma
  ilustração), a esteira em seis passos, o problema, a engenharia e os links
  para código, README e ADRs.
- **Quatro destinos** no cabeçalho, com nomes do que se faz neles: Esteira,
  Entrevistas, Decisões, Por dentro. As telas de engenharia (ingestão,
  Slack/integrações, saúde, funil, configuração) ficam atrás de "Por dentro",
  com uma página "Por trás do produto" que liga cada etapa ao arquivo onde ela
  mora.
- **Toda tela se explica** numa linha abaixo do título.
- **Tour guiado** de nove passos sobre a interface real (spotlight + coachmark),
  seguindo uma entrevista da chegada da gravação à decisão e à mensagem no
  Slack. O passo vive na URL (`?tour=N`): voltar do navegador volta o tour, e
  qualquer passo abre direto — para screenshots, para a auditoria de
  acessibilidade e para um link compartilhado. Sair com Esc guarda o lugar; o
  cabeçalho oferece "Retomar".

### 4. O que muda no ADR 0005

**O banner vira marca.** A invariante "nenhum quadro é ambíguo sobre o que
mostra" continua, e continua não dispensável: toda tela da demonstração tem
"Dados fictícios" no cabeçalho, a página inicial diz isso junto dos botões e no
rodapé, IDs continuam `demo-` e nomes continuam impossíveis de confundir com
gente. O que sai é o banner amarelo de largura total, que gritava mais alto
que o produto.

**"Avançar esteira" vira "Simular nova entrevista".** Um passo global de relógio
("passo 0") não se explica para quem chega. A ação nova cria uma entrevista
roteirizada e a conduz pela esteira, uma etapa de cada vez, com a gravação
deslizando entre as colunas. A regra que importava continua de pé: **nada se
move sem uma pessoa pedir**, e o estado continua sendo uma função pura de
(âncora, lista de ações). O que espaça os passos é um temporizador na
interface que despacha ações `step` comuns — o reducer não sabe que ele existe.
Com `prefers-reduced-motion` o intervalo encurta e a animação some. Reprocessar
uma falha retoma a caminhada do mesmo jeito, como `app/tasks.py` retoma do
checkpoint.

Toda entrevista simulada traz **uma** citação que a pessoa não disse, porque é
isso que a demonstração existe para mostrar. É roteiro, e está declarado como
tal (`demo/dataset.ts`); o alarme continua **derivado** — a citação é marcada
porque a busca de fato não a encontra.

## Alternativas rejeitadas

- **Manter o seletor de modo e subir um backend público.** Custo, segredos de
  provedores de IA e uma superfície de escrita aberta na internet, para
  entregar a um recrutador o que a demonstração já entrega sem rede.
- **Esconder o seletor com uma flag em runtime.** O código continuaria no bundle,
  e o erro de CORS continuaria a um link de distância.
- **Um app separado para a vitrine.** Duas cópias das telas que mais importam
  divergiriam na primeira mudança; aqui é o mesmo código com um literal.
- **Tour em slides.** Mostraria uma interface que não é a que o visitante vai
  usar em seguida. O tour aponta para os elementos reais, e um teste percorre
  os nove passos na aplicação de verdade.

## Consequências

### Prós

- A demo pública não tem como mostrar um erro de API: o código não está lá.
- Em dez segundos a página inicial diz o que o projeto é e mostra o alarme
  funcionando; em dois minutos o tour mostra o resto.
- A garantia de zero rede ganhou uma verificação em bytes, além dos testes.

### Contras, aceitos

- **Dois builds para verificar.** O CI builda os dois, audita os dois com axe e
  mede os dois contra o orçamento.
- **O showcase não mostra o comportamento real da API** (erros de chave, CORS,
  latência). Quem quer ver isso roda o build normal — e o painel de saúde do
  showcase aponta onde está o código de cada parte.
- **Fontes auto-hospedadas** (Newsreader, Schibsted Grotesk, JetBrains Mono,
  só o subconjunto latino) somam ~205 KB woff2 fora do orçamento inicial:
  carregam sob demanda, com `font-display: swap`, sem bloquear a primeira
  pintura. CDN de fontes violaria a invariante de zero rede.
