#!/usr/bin/env node
// Records the product demo video embedded in the README.
//
// Runs against the SHOWCASE build — the public demo, which is what a visitor
// actually sees — for the same reasons the screenshots do: it is
// deterministic, needs no backend, and every screen has data. The video says
// so on screen: the title card names the dataset as synthetic, and the
// "Dados fictícios" mark is in the header of every app frame.
//
// There is no LLM in the demonstration, so there is no real wait to
// fast-forward: every animation in the video (the new interview walking the
// pipeline, the smooth scrolls) plays at the speed the product plays it.
//
// Usage:
//   npm run build:showcase
//   npm run preview:showcase &    # port 4173, the default target
//   npm run demo-video            # PREVIEW_URL=http://127.0.0.1:<port> for another server
//
// Output (not committed): docs/demo/demo.mp4 — the README version, 1080p under
// GitHub's 10 MB attachment limit — and docs/demo/demo-linkedin.mp4, the
// 2560×1440 CRF 16 file for social posts. Needs ffmpeg on PATH.

import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { Director, SCALE, VIEWPORT } from './demo/director.mjs';
import { BASE_URL, CLOCK_ANCHOR } from './routes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = {
  readme: resolve(here, '../../docs/demo/demo.mp4'),
  linkedin: resolve(here, '../../docs/demo/demo-linkedin.mp4'),
};
/** Height of the sticky masthead at the recording viewport. */
const MASTHEAD = 62;
/** The highlighter of the visual identity: ripples, caption labels, card glow. */
const ACCENT = '#e8c33a';

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
  localStorage.setItem('scorecard-pipeline.prefs', JSON.stringify({ theme: 'light', pollIntervalMs: 5000 }));
});
const d = await Director.create(context, { topInset: MASTHEAD, accent: ACCENT });
const { page } = d;
page.setDefaultTimeout(15000);

const mainNav = (label) => page.locator('.main-nav__link', { hasText: label });
const insideNav = (label) => page.locator('.inside-nav__link', { hasText: label });

/**
 * Resolves once the page has stopped scrolling. A smooth scroll over a long
 * distance outlasts the director's fixed wait, and a box measured mid-scroll
 * sends the cursor to where the element USED to be.
 */
const settle = () =>
  page.evaluate(
    () =>
      new Promise((done) => {
        let last = -1;
        let still = 0;
        const tick = () => {
          still = window.scrollY === last ? still + 1 : 0;
          last = window.scrollY;
          if (still >= 6) done();
          else requestAnimationFrame(tick);
        };
        tick();
      }),
  );
/** `pointAt`, measured only after any scroll it causes has finished. */
const aim = async (locator, ms) => {
  await d.reveal(locator);
  await settle();
  await d.pointAt(locator, ms);
};
/** `click`, with the same guarantee. */
const press = async (locator, options) => {
  await d.reveal(locator);
  await settle();
  await d.click(locator, options);
};
/**
 * Points at the text itself. A block-level line, or a row of buttons, is as
 * wide as its container, and its centre is empty space to the right of what
 * the caption talks about.
 */
const aimText = async (locator, ms) => {
  await d.reveal(locator);
  await settle();
  const { x, y } = await locator.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await d.moveTo(x, y, ms);
};
/**
 * The masthead is sticky, so its links are always on screen, and anything
 * that "scrolls them into view" moves the page instead: the director's
 * `reveal` (a nav link starts at y = 0, above any inset) and Playwright's own
 * `locator.click`, whose actionability scroll lifted the scorecard ~120 px
 * for a few frames before the route changed (take 7). A plain mouse click at
 * the link's centre scrolls nothing; the `.hop` wait after it proves it hit.
 */
const clickNav = async (locator) => {
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await d.moveTo(x, y, 750);
  await d.hold(180);
  await page.mouse.click(x, y, { delay: 70 });
};

// ── 0 · Title ───────────────────────────────────────────────────────
// The pinned clock makes every relative date ("gravada há 3 h") the same on
// every take.
await d.goto(`${BASE_URL}/#/?t=${CLOCK_ANCHOR}`);
await d.card(
  `<h1>Scorecard Pipeline</h1><p>A IA avalia a entrevista, o sistema confere cada citação e uma pessoa decide.</p><small>Demonstração · dados sintéticos · roda inteiro no navegador</small>`,
);
await page.locator('.specimen__quote').waitFor();
await d.hold(800);
await d.record();
await d.hold(2400);
await d.card(null, 700);

// ── 1 · Landing: the argument in one screen ─────────────────────────
await d.caption('A proposta', 'O modelo citou uma frase que o candidato nunca disse — e o sistema pegou');
await aim(page.locator('.specimen__quote'), 900);
await d.hold(1500);
await aim(page.locator('.specimen__stamp'), 600);
await d.hold(700);
await aim(page.locator('.specimen__nearest'), 700);
await d.hold(1500);
await d.caption('Como explorar', 'Tour guiado de 2 minutos ou exploração livre — tudo no navegador');
await aim(page.getByRole('button', { name: /Fazer o tour guiado/ }).first(), 800);
await d.hold(1300);
await press(page.getByRole('link', { name: /Explorar por conta própria/ }).first());

// ── 2 · The pipeline, and a new interview going through it ──────────
await page.locator('.board__stages').waitFor();
await d.caption('Esteira', 'Cada entrevista num estado real do backend — e a esteira para antes da decisão');
await d.hold(400);
await aim(page.locator('.stage--aguardando_aprovacao .stage__label'), 900);
await d.hold(1800);
await d.caption('Nova entrevista', 'Uma gravação chega pelo webhook e um worker a leva etapa por etapa');
await press(page.getByRole('button', { name: 'Simular nova entrevista' }));
// Each stage is its own wait: the card must really be in that column. The
// cursor follows along the column headers — the card itself is moving, so a
// box measured on it would be stale by the time the cursor got there. Every
// stage, detected on the next animation frame: `locator.waitFor` backs off to
// 500 ms polls, and the cursor then reached each column as the card left it.
// The board does not scroll here, so no reveal/settle before pointing either.
const fresh = (stage) => page.locator(`.stage--${stage} .bcard--fresh`);
const label = (stage) => page.locator(`.stage--${stage} .stage__label`);
const arrived = (stage) =>
  page.waitForFunction((s) => document.querySelector(`.stage--${s} .bcard--fresh`) !== null, stage, {
    polling: 'raf',
  });
for (const stage of ['recebida', 'transcrevendo', 'diarizando']) {
  await arrived(stage);
  await d.pointAt(label(stage), 500);
}
await arrived('pontuando');
await d.caption('Pontuação', 'Um LLM aplica a rubrica da vaga — e cada citação é conferida no texto');
await d.pointAt(label('pontuando'), 500);
await arrived('aguardando_aprovacao');
await d.pointAt(fresh('aguardando_aprovacao'), 700);
await d.hold(1000);
const ready = page.locator('.sim-note', { hasText: 'pronta para revisão' });
await ready.waitFor();
await d.caption('Revisão', 'Scorecard pronto — e ele traz uma citação que não está na transcrição');
await aim(ready, 800);
await d.hold(1800);
await press(ready.getByRole('link', { name: 'Abrir o scorecard' }));

// ── 3 · The scorecard: a score means its rubric anchor ──────────────
const firstCompetency = page.locator('li.competency').first();
await firstCompetency.waitFor();
// Whose scorecard, and the verdict in one line, before the details.
await d.caption('Scorecard', 'Nota de 1 a 5 por competência, com o texto da rubrica BARS por trás do nível');
await aim(page.locator('.verdict__item--alert'), 800);
await d.hold(1200);
await d.frame(firstCompetency);
await aim(firstCompetency.locator('.score__value'), 700);
await d.hold(900);
await aim(firstCompetency.locator('.competency__anchor'), 700);
await d.hold(2200);

// ── 4 · The alarm the whole system exists for ───────────────────────
const flagged = page.locator('li.competency--flagged').first();
await d.caption('Alarme', 'Esta frase não está na transcrição: o sistema acusa e mostra o trecho mais parecido');
await d.frame(flagged);
await aim(flagged.locator('.quote__text'), 800);
await d.hold(1800);
await aim(flagged.locator('.evidence__nearest'), 700);
await d.hold(2300);

// ── 5 · A verified citation leads to the transcript ─────────────────
await d.caption('Evidência', 'Citação verificada leva ao trecho exato da transcrição, marcado para conferir');
await d.frame(firstCompetency);
await press(firstCompetency.getByRole('link', { name: 'Ver na transcrição' }));
const mark = page.locator('li.turn--highlight mark.turn__mark');
await mark.waitFor();
await d.hold(600);
await aim(mark, 800);
await d.hold(2300);

// ── 6 · A person decides, in two steps ──────────────────────────────
const decision = page.locator('[data-tour="decision"]');
await d.caption('Decisão humana', 'A IA recomenda, uma pessoa decide: duas etapas, com o alerta repetido na hora');
await d.frame(decision);
await d.hold(500);
await press(decision.getByRole('button', { name: 'Aprovar' }));
const warning = decision.locator('.decision__confirm-warning');
await warning.waitFor();
await aim(warning, 700);
await d.hold(1900);
await press(decision.getByRole('button', { name: 'Confirmar aprovar' }));
await page.locator('.detail-head .status', { hasText: 'Aprovada' }).waitFor();
const audit = decision.locator('.audit__what').first();
await audit.waitFor();
await d.caption('Registro', 'Aprovada — e a trilha de auditoria (sintética na demo) mostra quem decidiu');
await aim(audit, 800);
await d.hold(2000);

// ── 7 · The Slack message ───────────────────────────────────────────
// Caption first, so the previous scene's caption never sits over a new screen.
await d.caption('Slack', 'O time recebe o mesmo scorecard em Block Kit — com o alerta em cada citação');
await clickNav(mainNav('Por dentro'));
await page.locator('.hop').first().waitFor();
// A new page opens at its top, tabs included.
await press(insideNav('Slack e integrações'));
await page.locator('.slack__message').waitFor();
await d.hold(300);
// An interview still awaiting a decision, so the message carries its buttons.
await d.choose(page.locator('.panel__head select'), { label: 'Bruno Exemplo' }, 800);
await page.locator('.slack__header', { hasText: 'Bruno Exemplo' }).waitFor();
await d.hold(700);
await aimText(page.locator('.slack__line', { hasText: 'ALERTA' }).first(), 900);
await d.hold(1900);
await d.caption('Slack', 'Enquanto a decisão está pendente, os botões levam um token de uso único');
await aimText(page.locator('.slack__actions'), 900);
await d.hold(1900);

// ── 8 · Behind the product ──────────────────────────────────────────
await d.caption('Por dentro', 'FastAPI, fila Redis/RQ e um worker com máquina de estados — cada etapa ligada ao código');
await press(insideNav('Como funciona'));
await page.locator('.hop').first().waitFor();
await d.hold(500);
// Framed, so the first row of file links sits clear of the caption.
await d.frame(page.locator('.arch__hops'));
await aim(page.locator('.hop__file', { hasText: 'app/tasks.py' }), 900);
await d.hold(2100);
await d.caption('Por dentro', 'Nenhuma transição sai de “aguardando aprovação” sem uma pessoa');
await d.frame(page.locator('.states'));
await aim(page.locator('.states__stop'), 700);
await d.hold(2100);

// ── 9 · Outro ───────────────────────────────────────────────────────
// The card is on screen ≈ 2 × this wait − 0.7 s: the director's concat list
// repeats the last frame, and ffmpeg honours its duration both times, so the
// wait after the fade-in plays twice (takes 5 and 8: 1.3 s → 1.9 s, 3.4 s →
// 6.0 s). 2350 ms lands the ~4 s the storyboard asks for.
await d.card(
  `<h1>Scorecard Pipeline</h1><p>FastAPI · Redis + RQ · PostgreSQL · Deepgram ou WhisperX<br>OpenRouter · React 19 + TypeScript</p><small>github.com/luccapinto/scorecard-pipeline · luccapinto.github.io/scorecard-pipeline</small>`,
  2350,
);

await d.finish(OUT);
await browser.close();
for (const file of Object.values(OUT)) console.log(`Demo gravada em ${relative(process.cwd(), file)}`);
