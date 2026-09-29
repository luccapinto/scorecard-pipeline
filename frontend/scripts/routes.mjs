// The route inventory shared by the accessibility audit and the screenshot
// script, so the two can never drift out of sync about what "every screen"
// means.
//
// Everything runs against DEMO mode: it is deterministic, needs no backend,
// and is the only mode where every screen has data to render. The clock
// anchor is pinned so both scripts produce byte-identical output on any day.
//
// The URLs work on both builds (`#/demo/...` is the demonstration in the full
// build and everything in the showcase). Set EDITION=showcase when pointing
// at the showcase preview: the one screen it does not have is skipped.

/** Pinned demo clock: 2026-09-21T14:00:00Z. */
export const CLOCK_ANCHOR = 1789999200000;

export const BASE_URL = process.env.PREVIEW_URL ?? 'http://localhost:4173';

export const EDITION = process.env.EDITION === 'showcase' ? 'showcase' : 'full';

/** The interview the guided tour creates; see features/tour/steps.ts. */
const TOUR_INTERVIEW = 'entrevistas/demo-runtime-1';

/**
 * `wait` is a selector that must exist before the page counts as rendered —
 * screenshotting or auditing a skeleton would be worse than useless.
 */
const ALL_ROUTES = [
  {
    id: 'inicio',
    path: '',
    title: 'Página inicial',
    wait: '.specimen__quote',
    caption: 'A proposta em uma frase, um caso real de citação inventada, e o caminho para o tour.',
  },
  {
    id: 'esteira',
    path: 'esteira',
    title: 'Esteira',
    wait: '.bcard',
    caption: 'Cada entrevista na sua etapa, da gravação à decisão humana, com a simulação de uma nova.',
  },
  {
    id: 'entrevista-alerta',
    path: 'entrevistas/demo-bruno-exemplo',
    title: 'Scorecard com citação que não existe',
    wait: '.evidence--alert',
    caption: 'Duas citações que não estão na transcrição — o alarme central do produto, com o trecho mais parecido.',
  },
  {
    id: 'entrevista-citacao',
    path: 'entrevistas/demo-ana-sintetica',
    query: 'citacao=0',
    title: 'Citação verificada na transcrição',
    wait: '.turn__mark',
    caption: 'Uma citação verificada leva ao trecho exato da transcrição, marcado.',
  },
  {
    id: 'entrevistas',
    path: 'entrevistas',
    title: 'Lista de entrevistas',
    wait: '.row',
    caption: 'Todas as entrevistas, com o que precisa de uma pessoa no topo.',
  },
  {
    id: 'decisoes',
    path: 'aprovacoes',
    title: 'Decisões',
    wait: '.approval',
    caption: 'A fila de decisão: uma candidatura por vez, sem aprovação em massa.',
  },
  {
    id: 'por-dentro',
    path: 'por-dentro',
    title: 'Por trás do produto',
    wait: '.hop',
    caption: 'A arquitetura do webhook à decisão, a máquina de estados, os ADRs e o que o CI cobra.',
  },
  {
    id: 'ingestao',
    path: 'nova',
    title: 'Ingestão',
    wait: '.inspector__block',
    caption: 'Disparo do webhook, com o payload, a assinatura HMAC redigida e o 202 explicado.',
  },
  {
    id: 'integracoes',
    path: 'integracoes',
    title: 'Slack e integrações',
    wait: '.slack__message',
    caption: 'Prévia fiel do Block Kit que o backend monta, e o link de decisão com o token redigido.',
  },
  {
    id: 'saude',
    path: 'saude',
    title: 'Saúde e observabilidade',
    wait: 'h1',
    caption: 'O que a interface observa sobre o backend e como cada falha é classificada.',
  },
  {
    id: 'funil',
    path: 'funil',
    title: 'Funil de candidatos',
    wait: '.fcard',
    caption: 'Funil de contratação — fases sintéticas, marcadas como tal porque não existem na API.',
  },
  {
    id: 'falha',
    path: 'entrevistas/demo-lucas-maquete',
    title: 'Falha reprocessável',
    wait: '.failure__headline',
    caption: 'Falha com o traceback legível e a ação de reprocessar.',
  },
  {
    id: 'configuracao',
    path: 'configuracao',
    title: 'Configuração',
    wait: 'h1',
    edition: 'full',
    caption: 'URL da API, chave, tema e intervalo de atualização — só no build com backend.',
  },
];

const TOUR = [
  ['esteira', 'Esta é a esteira'],
  ['esteira', 'Uma gravação chega'],
  ['esteira', 'A esteira processa, etapa por etapa'],
  [TOUR_INTERVIEW, 'O scorecard'],
  [TOUR_INTERVIEW, 'A citação que não existe'],
  [TOUR_INTERVIEW, 'Evidência que dá para conferir', 'citacao=0'],
  [TOUR_INTERVIEW, 'A decisão é humana'],
  ['integracoes', 'O time fica sabendo no Slack'],
  ['por-dentro', 'Por trás do produto'],
];

export const TOUR_ROUTES = TOUR.map(([path, title, query], index) => ({
  id: `tour-${index + 1}`,
  path,
  query: [query, `tour=${index + 1}`].filter(Boolean).join('&'),
  title: `Tour, passo ${index + 1}: ${title}`,
  // The ring appears once the step found its target on the live page.
  wait: '.tour__ring',
  caption: `Passo ${index + 1} de ${TOUR.length} do tour guiado: ${title}.`,
}));

export const ROUTES = ALL_ROUTES.filter(
  (route) => route.edition === undefined || route.edition === EDITION,
);

export function urlFor(route) {
  const query = [`t=${CLOCK_ANCHOR}`, route.query].filter(Boolean).join('&');
  return `${BASE_URL}/#/demo${route.path ? `/${route.path}` : ''}?${query}`;
}
