#!/usr/bin/env node
// Regenerates the README screenshots from the running application.
//
// Reproducible by construction: demo mode has no wall clock and no randomness,
// and the URL pins the clock anchor, so the same build always produces the
// same pixels. That is the reason the demo was designed deterministic — a
// screenshot set nobody can regenerate rots the first time the UI changes.
//
// Images are committed (CI does not run a browser for this), but the script
// ships with them so anyone can redo the set after a UI change.
//
// Usage:
//   npm run build
//   npm run preview &            # or PREVIEW_URL=... npm run screenshots
//   npm run screenshots

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { BASE_URL, ROUTES, urlFor } from './routes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../docs/assets');

const DESKTOP = { width: 1440, height: 960 };
const MOBILE = { width: 390, height: 844 };

mkdirSync(OUT, { recursive: true });

/** Preferences are read from localStorage at boot; seed them before loading. */
async function seedPreferences(page, theme) {
  await page.addInitScript((value) => {
    localStorage.setItem(
      'scorecard-pipeline.prefs',
      JSON.stringify({ theme: value, pollIntervalMs: 5000, lastMode: 'demo' }),
    );
  }, theme);
}

async function capture(browser, { route, theme, viewport, suffix, fullPage }) {
  const context = await browser.newContext({
    viewport,
    // Scale 1: the README renders these around 800px wide, so a 2x capture
    // quadruples the bytes committed to the repository for no visible gain.
    deviceScaleFactor: 1,
    colorScheme: theme,
    // A fixed locale and timezone keep dates and number formatting identical
    // on any machine; Intl output is what would otherwise drift.
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await seedPreferences(page, theme);
  await page.goto(urlFor(route), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(route.wait, { timeout: 15000 });
  // Skeletons animate; reduced-motion above stops them, but give layout one
  // frame to settle so nothing is captured mid-reflow.
  await page.waitForTimeout(250);

  const name = `${route.id}${suffix ?? ''}.png`;
  await page.screenshot({ path: join(OUT, name), fullPage: Boolean(fullPage) });
  await context.close();
  return name;
}

const browser = await chromium.launch();
const written = [];

for (const route of ROUTES) {
  written.push(await capture(browser, { route, theme: 'light', viewport: DESKTOP }));
}

// One dark capture and one mobile capture: enough to show both are designed,
// without doubling the image count in the repository.
const dashboard = ROUTES.find((route) => route.id === 'esteira');
const scorecard = ROUTES.find((route) => route.id === 'entrevista-alerta');

written.push(
  await capture(browser, {
    route: dashboard,
    theme: 'dark',
    viewport: DESKTOP,
    suffix: '-escuro',
  }),
);
written.push(
  await capture(browser, {
    route: dashboard,
    theme: 'light',
    viewport: MOBILE,
    suffix: '-mobile',
  }),
);
written.push(
  await capture(browser, {
    route: scorecard,
    theme: 'dark',
    viewport: DESKTOP,
    suffix: '-escuro',
    fullPage: true,
  }),
);

await browser.close();

// A manifest makes it obvious in review which images the README should have.
writeFileSync(
  join(OUT, 'README.md'),
  [
    '# Capturas de tela',
    '',
    'Geradas por `frontend/scripts/screenshots.mjs` a partir do **modo',
    'demonstração**, cujo dataset é sintético e determinístico. Todos os nomes,',
    'vagas e decisões nas imagens são fictícios.',
    '',
    'Para regenerar:',
    '',
    '```bash',
    'cd frontend',
    'npm run build',
    'npm run preview &',
    'npm run screenshots',
    '```',
    '',
    '| Arquivo | Tela |',
    '| --- | --- |',
    ...written.map((file) => {
      const route = ROUTES.find((item) => file.startsWith(item.id));
      const variant = file.includes('-escuro')
        ? ' (tema escuro)'
        : file.includes('-mobile')
          ? ' (mobile, 390px)'
          : '';
      return `| \`${file}\` | ${route?.title ?? file}${variant} |`;
    }),
    '',
  ].join('\n'),
  'utf8',
);

console.log(`Wrote ${written.length} screenshots to ${OUT} from ${BASE_URL}:`);
for (const file of written) console.log(`  ${file}`);
