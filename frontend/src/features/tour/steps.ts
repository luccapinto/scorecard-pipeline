// The guided tour, as data.
//
// Every step points at the REAL interface — a `data-tour` attribute on a live
// element — not at a slide. The story follows one interview from the moment
// its recording arrives to the moment a person decides, because that is the
// whole product: the model scores, the system checks the model, a human
// decides.
//
// `requires` is what makes each step independently openable (`?tour=5`) for
// screenshots, the accessibility audit and tests: before a step renders, the
// demo guarantees the simulated interview it talks about exists and has
// progressed far enough — built instantly and purely, never by waiting.

import type { Route } from '../../app/routes';
import type { SimulationLevel } from '../../data/demoControls';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** The element to spotlight. */
  target: string;
  /** Where the step happens; `simulatedId` is the interview the tour follows. */
  route: (simulatedId: string) => Pick<Route, 'mode' | 'name' | 'id' | 'quote'>;
  requires?: SimulationLevel;
  /**
   * Leaving this step forward starts a live simulation instead of preparing
   * the next step instantly — the one moment the animation is the point.
   */
  startsSimulation?: boolean;
}

const pipeline = () => ({ mode: 'demo', name: 'dashboard' }) as const;
const interview = (id: string) => ({ mode: 'demo', name: 'interview', id }) as const;

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'esteira',
    title: 'Esta é a esteira',
    body: 'Cada entrevista gravada atravessa etapas automáticas, da esquerda para a direita — e para antes da decisão, que é sempre de uma pessoa. Cada coluna é um estado real do backend.',
    target: '[data-tour="pipeline"]',
    route: pipeline,
  },
  {
    id: 'chegada',
    title: 'Uma gravação chega',
    body: 'Aperte “Simular nova entrevista” (ou Próximo). Uma gravação fictícia entra pelo mesmo webhook que um sistema de videochamada usaria: assinado com HMAC e idempotente.',
    target: '[data-tour="simulate"]',
    route: pipeline,
    startsSimulation: true,
  },
  {
    id: 'processamento',
    title: 'A esteira processa, etapa por etapa',
    body: 'Um worker tira o trabalho de uma fila (Redis + RQ) e avança a máquina de estados: transcrição do áudio, separação de quem falou e a pontuação feita por um modelo de linguagem. Se uma etapa falha, ela pode ser retomada dali.',
    target: '[data-tour="pipeline"]',
    route: pipeline,
    requires: 'midway',
  },
  {
    id: 'scorecard',
    title: 'O scorecard',
    body: 'Cada competência da vaga recebe uma nota de 1 a 5 numa escala BARS. O texto ao lado da nota é a âncora da rubrica: diz, em comportamento observável, o que aquele número significa.',
    target: '[data-tour="competency"]',
    route: interview,
    requires: 'processed',
  },
  {
    id: 'alucinacao',
    title: 'A citação que não existe',
    body: 'Para justificar esta nota, o modelo citou uma frase que a pessoa entrevistada nunca disse. O sistema procurou na transcrição, não encontrou, e acendeu o alarme — mostrando o trecho mais parecido que a busca achou.',
    target: '[data-tour="evidence-alert"]',
    route: interview,
    requires: 'processed',
  },
  {
    id: 'transcricao',
    title: 'Evidência que dá para conferir',
    body: 'Uma citação verificada leva direto ao trecho da transcrição, marcado. Quem revisa não precisa acreditar no modelo: confere com os próprios olhos, em um clique.',
    // The marked passage itself, not the whole panel: on a phone the panel is
    // taller than the screen and the coachmark would cover the highlight.
    target: '.turn--highlight',
    // Competency 0 is never the fabricated one in any simulation script.
    route: (id) => ({ ...interview(id), quote: 0 }),
    requires: 'processed',
  },
  {
    id: 'decisao',
    title: 'A decisão é humana',
    body: 'O pipeline para aqui. Aprovar ou rejeitar exige duas etapas, nomeia a pessoa e repete o alerta de evidência. Não existe aprovação em massa — nem nesta demonstração. Pode testar.',
    target: '[data-tour="decision"]',
    route: interview,
    requires: 'processed',
  },
  {
    id: 'slack',
    title: 'O time fica sabendo no Slack',
    body: 'Quando o scorecard fica pronto, a mesma avaliação vai para o Slack em Block Kit: as notas, o marcador de verificação de cada citação e, enquanto a decisão está pendente, botões com um token de uso único.',
    target: '[data-tour="slack"]',
    route: () => ({ mode: 'demo', name: 'integrations' }),
    requires: 'processed',
  },
  {
    id: 'bastidores',
    title: 'Por trás do produto',
    body: 'API em FastAPI, fila Redis + RQ, um worker com máquina de estados, verificação de evidência por texto normalizado e similaridade, notificações e testes no CI. Os links levam ao código, ao README e às decisões de arquitetura.',
    target: '[data-tour="architecture"]',
    route: () => ({ mode: 'demo', name: 'inside' }),
  },
];

/** The simulated interview a step needs before it can render, if any. */
export function tourRequirement(route: Route): SimulationLevel | undefined {
  return route.tour === undefined ? undefined : TOUR_STEPS[route.tour - 1]?.requires;
}
