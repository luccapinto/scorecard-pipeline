// The route inventory shared by the accessibility audit and the screenshot
// script, so the two can never drift out of sync about what "every screen"
// means.
//
// Everything runs against DEMO mode: it is deterministic, needs no backend,
// and is the only mode where every screen has data to render. The clock
// anchor is pinned so both scripts produce byte-identical output on any day.

/** Pinned demo clock: 2026-09-21T14:00:00Z. */
export const CLOCK_ANCHOR = 1789999200000;

export const BASE_URL = process.env.PREVIEW_URL ?? 'http://localhost:4173';

/**
 * `wait` is a selector that must exist before the page counts as rendered —
 * screenshotting or auditing a skeleton would be worse than useless.
 */
export const ROUTES = [
  {
    id: 'esteira',
    path: 'esteira',
    title: 'Esteira',
    wait: '.queue__item',
    caption: 'Painel da esteira: métricas do período, distribuição de notas e taxa de evidência verificada.',
  },
  {
    id: 'entrevista-alerta',
    path: 'entrevistas/demo-bruno-exemplo',
    title: 'Scorecard com evidência não verificada',
    wait: '.evidence--alert',
    caption: 'Scorecard com duas citações que não existem na transcrição — o alarme central do produto.',
  },
  {
    id: 'entrevistas',
    path: 'entrevistas',
    title: 'Lista de entrevistas',
    wait: '.row',
    caption: 'Lista completa, com o que precisa de decisão humana no topo.',
  },
  {
    id: 'aprovacoes',
    path: 'aprovacoes',
    title: 'Fila de aprovação',
    wait: '.approval',
    caption: 'Fila ordenada por tempo de espera, com o necessário para decidir visível sem abrir o item.',
  },
  {
    id: 'integracoes',
    path: 'integracoes',
    title: 'Integrações e mensagens',
    wait: '.slack__message',
    caption: 'Prévia fiel do Block Kit que o backend monta, e a forma do link de decisão com o token redigido.',
  },
  {
    id: 'funil',
    path: 'funil',
    title: 'Funil de candidatos',
    wait: '.fcard',
    caption: 'Funil de contratação — fases sintéticas, marcadas como tal porque não existem na API.',
  },
  {
    id: 'ingestao',
    path: 'nova',
    title: 'Ingestão',
    wait: '.inspector__block',
    caption: 'Disparo do webhook, com o payload, a assinatura HMAC redigida e o 202 explicado.',
  },
  {
    id: 'falha',
    path: 'entrevistas/demo-lucas-maquete',
    title: 'Falha reprocessável',
    wait: '.failure__headline',
    caption: 'Falha com o traceback legível e a ação de reprocessar.',
  },
  {
    id: 'saude',
    path: 'saude',
    title: 'Saúde e observabilidade',
    wait: 'h1',
    caption: 'Saúde da API, latência da última requisição, estado do polling e taxonomia de erros.',
  },
  {
    id: 'configuracao',
    path: 'configuracao',
    title: 'Configuração',
    wait: 'h1',
    caption: 'URL da API, X-API-Key, tema e intervalo de atualização — tudo em runtime, nada no bundle.',
  },
];

export function urlFor(route) {
  return `${BASE_URL}/#/demo/${route.path}?t=${CLOCK_ANCHOR}`;
}
