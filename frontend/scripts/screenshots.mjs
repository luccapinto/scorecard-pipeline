#!/usr/bin/env node
// Regenerates the README screenshots from the running application — or, with
// `--matrix <dir>`, every screen and every tour step at every size and theme,
// for reviewing a visual change before it ships.
//
// Reproducible by construction: demo mode has no wall clock and no randomness,
// and the URL pins the clock anchor, so the same build always produces the
// same pixels. That is the reason the demo was designed deterministic — a
// screenshot set nobody can regenerate rots the first time the UI changes.
//
// Images are committed (CI does not run a browser for this), but the script
// ships with them so anyone can redo the set after a UI change. Point it at
// the showcase preview: that is what the README links to.
//
// Usage:
//   npm run build:showcase
//   npm run preview:showcase &     # or PREVIEW_URL=... npm run screenshots
//   npm run screenshots                         # README set → docs/assets
//   npm run screenshots -- --matrix /tmp/shots  # full review matrix

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { BASE_URL, ROUTES, TOUR_ROUTES, urlFor } from './routes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const README_DIR = resolve(here, '../../docs/assets');

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 720 },
  mobile: { width: 390, height: 844 },
};

const byId = Object.fromEntries([...ROUTES, ...TOUR_ROUTES].map((route) => [route.id, route]));

/**
 * The set the README uses. Viewport-sized on purpose: a recruiter sees the
 * first screen of each page, and so should the README.
 */
const README_SET = [
  { id: 'inicio', viewport: 'desktop' },
  { id: 'esteira', viewport: 'desktop' },
  { id: 'entrevista-alerta', viewport: 'desktop' },
  { id: 'entrevista-citacao', viewport: 'desktop' },
  { id: 'tour-5', viewport: 'desktop' },
  { id: 'tour-3', viewport: 'desktop' },
  { id: 'decisoes', viewport: 'desktop' },
  { id: 'por-dentro', viewport: 'desktop' },
  { id: 'integracoes', viewport: 'desktop' },
  { id: 'ingestao', viewport: 'desktop' },
  { id: 'funil', viewport: 'desktop' },
  { id: 'falha', viewport: 'desktop' },
  { id: 'entrevistas', viewport: 'desktop' },
  { id: 'saude', viewport: 'desktop' },
  { id: 'inicio', viewport: 'desktop', theme: 'dark' },
  { id: 'entrevista-alerta', viewport: 'desktop', theme: 'dark' },
  { id: 'inicio', viewport: 'mobile' },
  { id: 'esteira', viewport: 'mobile' },
  { id: 'tour-5', viewport: 'mobile' },
];

function fileName({ id, viewport, theme }) {
  const suffix = [viewport === 'desktop' ? '' : viewport, theme === 'dark' ? 'escuro' : '']
    .filter(Boolean)
    .join('-');
  return `${id}${suffix ? `-${suffix}` : ''}.png`;
}

async function capture(browser, outDir, shot) {
  const route = byId[shot.id];
  const theme = shot.theme ?? 'light';
  const context = await browser.newContext({
    viewport: VIEWPORTS[shot.viewport],
    // Scale 1: the README renders these around 800px wide, so a 2x capture
    // quadruples the bytes committed to the repository for no visible gain.
    deviceScaleFactor: 1,
    colorScheme: theme,
    // A fixed locale and timezone keep dates and number formatting identical
    // on any machine; Intl output is what would otherwise drift.
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    // Also makes the demo's simulation and the tour's scrolling instant.
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  // Preferences are read from localStorage at boot; seed them before loading.
  await page.addInitScript((value) => {
    localStorage.setItem('scorecard-pipeline.prefs', JSON.stringify({ theme: value, pollIntervalMs: 5000 }));
  }, theme);
  await page.goto(urlFor(route), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(route.wait, { timeout: 15000 });
  // Fonts, the tour's scroll and its spotlight settle over a few frames.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(route.id.startsWith('tour-') ? 700 : 300);

  const name = fileName(shot);
  await page.screenshot({ path: join(outDir, name), fullPage: Boolean(shot.fullPage) });
  await context.close();
  return { name, route, shot };
}

const matrixAt = process.argv.indexOf('--matrix');
const outDir = matrixAt === -1 ? README_DIR : resolve(process.argv[matrixAt + 1] ?? 'screenshots');
mkdirSync(outDir, { recursive: true });

const shots =
  matrixAt === -1
    ? README_SET
    : [...ROUTES, ...TOUR_ROUTES].flatMap((route) => [
        { id: route.id, viewport: 'desktop' },
        { id: route.id, viewport: 'laptop' },
        { id: route.id, viewport: 'mobile' },
        { id: route.id, viewport: 'desktop', theme: 'dark' },
        { id: route.id, viewport: 'mobile', theme: 'dark' },
      ]);

if (matrixAt === -1) {
  // The README set is the whole directory: drop images from an older set so
  // nothing stale lingers next to the fresh ones.
  for (const file of readdirSync(outDir)) {
    if (file.endsWith('.png')) rmSync(join(outDir, file));
  }
}

const browser = await chromium.launch();
const written = [];
for (const shot of shots) written.push(await capture(browser, outDir, shot));
await browser.close();

if (matrixAt === -1) {
  // A manifest makes it obvious in review which images the README should have.
  writeFileSync(
    join(outDir, 'README.md'),
    [
      '# Capturas de tela',
      '',
      'Geradas por `frontend/scripts/screenshots.mjs` a partir do **build showcase**',
      '(a demonstração pública), cujo dataset é sintético e determinístico. Todos os',
      'nomes, vagas e decisões nas imagens são fictícios.',
      '',
      'Para regenerar:',
      '',
      '```bash',
      'cd frontend',
      'npm run build:showcase',
      'npm run preview:showcase -- --port 4173 &',
      'npm run screenshots',
      '```',
      '',
      '| Arquivo | Tela |',
      '| --- | --- |',
      ...written.map(({ name, route, shot }) => {
        const variant = [
          shot.viewport === 'mobile' ? 'mobile, 390px' : '',
          shot.theme === 'dark' ? 'tema escuro' : '',
        ]
          .filter(Boolean)
          .join(', ');
        return `| \`${name}\` | ${route.title}${variant ? ` (${variant})` : ''} |`;
      }),
      '',
    ].join('\n'),
    'utf8',
  );
}

console.log(`Wrote ${written.length} screenshots to ${outDir} from ${BASE_URL}:`);
for (const { name } of written) console.log(`  ${name}`);
