#!/usr/bin/env node
// Records the product demo video embedded in the README.
//
// Runs against DEMO mode for the same reason the screenshots do: it is
// deterministic, needs no backend, and every screen has data. The video says
// so on screen — the demo banner is in every frame and the title card names
// the dataset as synthetic.
//
// Usage:
//   npm run build
//   npm run preview &            # or PREVIEW_URL=... npm run demo-video
//   npm run demo-video
//
// Output: docs/demo/demo.mp4 (not committed — hosted as a GitHub attachment).
// Needs ffmpeg on PATH.

import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { Director, SCALE, VIEWPORT } from './demo/director.mjs';
import { urlFor } from './routes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../docs/demo/demo.mp4');
/** Height of the sticky top bar at the recording viewport. */
const TOPBAR = 78;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: SCALE,
  colorScheme: 'light',
  // Same pinning as the screenshots: dates and numbers identical on any machine.
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
});
await context.addInitScript(() => {
  localStorage.setItem(
    'scorecard-pipeline.prefs',
    JSON.stringify({ theme: 'light', pollIntervalMs: 5000, lastMode: 'demo' }),
  );
});
const d = await Director.create(context, { topInset: TOPBAR });
const { page } = d;
page.setDefaultTimeout(15000);

const nav = (path) => page.locator(`.nav__link[href*="/demo/${path}"]`);
const advance = page.getByRole('button', { name: 'Avançar esteira' });
const status = page.locator('.view-head__title .status');

// ── 0 · Title ───────────────────────────────────────────────────────
await d.goto(urlFor({ path: 'esteira' }));
await d.card(
  `<h1>Scorecard Pipeline</h1><p>Da gravação de uma entrevista técnica a um scorecard com evidências verificadas — e a decisão final é sempre humana.</p><small>Modo demonstração · dados sintéticos · roda inteiro no navegador</small>`,
);
await page.locator('.queue__item').first().waitFor();
await d.hold(600);
await d.record();
await d.hold(3000);
await d.card(null, 700);

await d.caption('Esteira', 'Cada gravação é transcrita, diarizada e pontuada por IA — e para numa pessoa');
await d.pointAt(page.getByText('Evidência verificada', { exact: true }).first(), 900);
await d.hold(2200);

// ── 2 · Ingestion ───────────────────────────────────────────────────
await d.click(nav('nova'));
await d.caption('Ingestão', 'Um webhook dispara o processamento — o JSON enviado aparece ao lado, ao vivo');
await page.locator('.inspector__block').first().waitFor();
await d.hold(900);
const job = page.getByLabel('Vaga', { exact: true });
await d.choose(job, { index: 1 }, 800);
await d.hold(900);
const recording = page.getByLabel('Gravação', { exact: true });
const recordingValue = await recording.locator('option', { hasText: 'dados_senior' }).getAttribute('value');
await d.choose(recording, recordingValue, 600);
await d.hold(900);
await d.click(page.getByRole('button', { name: 'Disparar webhook' }));
await page.getByRole('heading', { name: '202 Accepted' }).waitFor();
await d.caption('Ingestão', 'O 202 é um aceite: o processamento segue assíncrono, num worker');
await d.hold(2000);
await d.click(page.getByRole('link', { name: 'Abrir entrevista' }));
await status.waitFor();
await d.hold(800);

// ── 3 · The pipeline advances ───────────────────────────────────────
// One caption per stage: the status badge alone is too small to carry the story.
const STAGES = [
  'Transcrevendo: o áudio vira texto — pela API do Deepgram ou 100% local, com WhisperX',
  'Diarizando: separa quem falou o quê, entrevistador e candidato',
  'Pontuando: o LLM avalia cada competência na escala BARS, citando a transcrição',
  'Aguardando aprovação: o scorecard está pronto — e a esteira para aqui',
];
await d.caption('Processamento', 'Na demonstração, a esteira avança uma etapa a cada clique');
await d.pointAt(advance, 800);
await d.hold(1200);
for (const stage of STAGES) {
  await d.click(advance, { ms: 200, pause: 80 });
  await d.caption('Processamento', stage);
  await d.hold(2100);
}
await page.locator('.scorecard').waitFor();
await d.frame(page.locator('.scorecard'));
await d.hold(1600);

// ── 4 · Approval queue ──────────────────────────────────────────────
await d.click(nav('aprovacoes'));
await d.caption('Aprovações', 'Fila por tempo de espera, uma decisão por vez — sem aprovação em massa, por design');
await page.locator('.approval').first().waitFor();
await d.scrollTop();
await d.hold(1400);
const bruno = page.locator('li.approval', { hasText: 'Bruno Exemplo' });
await d.pointAt(bruno.locator('.approval__alert'), 800);
await d.hold(2200);

// ── 5 · The alarm the whole system exists for ───────────────────────
await d.click(bruno.getByRole('link', { name: 'Abrir scorecard e decidir' }));
await d.caption('Evidência', 'Cada citação do modelo é conferida na transcrição — a que não existe vira alarme');
const alarm = page.locator('.evidence--alert').first();
await alarm.waitFor();
await d.hold(800);
await d.frame(page.locator('li.competency', { has: alarm }).first());
await d.pointAt(alarm.locator('.evidence__headline'), 800);
await d.hold(1600);
await d.pointAt(alarm.locator('.evidence__nearest'), 700);
await d.hold(2400);

// ── 6 · Verified quotes lead to the transcript ─────────────────────
await d.caption('Transcrição', 'As citações verificadas levam direto ao trecho da fala');
const verified = page.locator('li.competency', { hasText: 'Orquestração de Pipelines' });
await d.click(verified.getByRole('button', { name: 'Ver na transcrição' }));
await page.locator('li.turn--highlight').waitFor();
await d.hold(1100);
await d.pointAt(page.locator('mark.turn__mark').first(), 700);
await d.hold(2400);

// ── 7 · A person decides ────────────────────────────────────────────
const decision = page.getByRole('region', { name: 'Decisão' });
await d.frame(decision);
await d.caption('Decisão humana', 'A IA recomenda; quem decide é uma pessoa — em duas etapas, com o aviso à vista');
await d.click(decision.getByRole('button', { name: 'Aprovar' }));
const warning = page.locator('.decision__confirm-warning');
await warning.waitFor();
await d.pointAt(warning, 700);
await d.hold(2200);
await d.click(page.getByRole('button', { name: 'Confirmar aprovar' }));
await status.filter({ hasText: 'Aprovada' }).waitFor();
await d.hold(600);
const audit = page.locator('.audit');
await audit.waitFor();
await d.pointAt(audit.locator('.audit__what').first(), 800);
await d.hold(2600);

// ── 8 · The Slack notification ──────────────────────────────────────
await d.click(nav('integracoes'));
await d.caption('Notificação', 'O Slack recebe o scorecard com o link de decisão — prévia fiel do payload real');
const slack = page.locator('.slack__message');
await slack.waitFor();
await d.hold(600);
await d.frame(page.locator('section', { has: slack }).last());
await d.hold(1800);
await d.click(page.getByRole('button', { name: 'Ver JSON bruto' }));
await page.locator('pre.slack__json').waitFor();
await d.hold(1800);

// ── 9 · Both themes ─────────────────────────────────────────────────
await d.click(nav('esteira'));
await page.locator('.queue__item').first().waitFor();
await d.scrollTop();
await d.caption('Temas', 'Tema escuro desenhado à parte — contraste WCAG AA verificado no CI');
await d.hold(500);
await d.click(page.getByRole('radiogroup', { name: 'Tema' }).getByRole('radio', { name: 'Tema escuro' }));
await d.hold(2800);

// ── 10 · Outro ──────────────────────────────────────────────────────
await d.caption('', '');
await d.card(
  `<h1>Scorecard Pipeline</h1><p>FastAPI · Redis + RQ · Deepgram ou WhisperX · LLM · React 19</p><small>Teste ao vivo: luccapinto.github.io/scorecard-pipeline · github.com/luccapinto/scorecard-pipeline</small>`,
  4000,
);

await d.finish(OUT);
await browser.close();
console.log(`Demo gravada em ${relative(process.cwd(), OUT)}`);
