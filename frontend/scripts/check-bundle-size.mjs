#!/usr/bin/env node
// Fails the build when the INITIAL page load exceeds the gzip budget.
//
// "Initial load" is defined precisely, because a budget measured on the wrong
// set of files is theatre: it is the document plus exactly the assets that
// index.html tells the browser to fetch before first paint — the entry script,
// its <link rel=modulepreload> dependencies, and the stylesheets. Chunks that
// are only reachable through a dynamic import (the whole demo module, the
// funnel board) are excluded, which is the point of splitting them out.
//
// Web fonts are reported separately and not counted: they are already
// compressed (woff2, so gzip does nothing), they load in parallel with
// `font-display: swap` and never block first paint, and the browser fetches
// only the faces a page actually uses. Listing them keeps that cost visible
// instead of silently outside the number.
//
// Both builds are checked when present: the full one (dist/) and the public
// showcase (dist-showcase/, see docs/adr/0006).
//
// Run: npm run check:size   (after npm run build and/or npm run build:showcase)

import { gzipSync } from 'node:zlib';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BUILDS = [
  { name: 'full', dir: resolve(here, '../dist') },
  { name: 'showcase', dir: resolve(here, '../dist-showcase') },
];

/** Budget in bytes, gzipped. Stated in frontend/README.md. */
const BUDGET_BYTES = 180 * 1024;

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

/** Returns false when the build is over budget or malformed. */
function check({ name, dir }) {
  const html = readFileSync(join(dir, 'index.html'), 'utf8');

  // Assets the document itself pulls in before first paint.
  const referenced = new Set();
  for (const pattern of [
    /<script[^>]+src="([^"]+)"/g,
    /<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g,
    /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g,
  ]) {
    let match = pattern.exec(html);
    while (match !== null) {
      referenced.add(match[1].replace(/^\.?\//, ''));
      match = pattern.exec(html);
    }
  }

  if (referenced.size === 0) {
    console.error(`[${name}] index.html references no assets — the size check would be vacuous.`);
    return false;
  }

  const rows = [{ file: 'index.html', gzip: gzipSync(Buffer.from(html)).length }];
  for (const asset of [...referenced].sort()) {
    const path = join(dir, asset);
    if (!existsSync(path)) {
      console.error(`[${name}] index.html references a missing asset: ${asset}`);
      return false;
    }
    rows.push({ file: asset, gzip: gzipSync(readFileSync(path)).length });
  }

  const total = rows.reduce((sum, row) => sum + row.gzip, 0);
  console.log(`\n[${name}] Initial load (gzipped):`);
  for (const row of rows) console.log(`  ${kib(row.gzip).padStart(10)}  ${row.file}`);
  console.log(`  ${'—'.repeat(10)}`);
  console.log(`  ${kib(total).padStart(10)}  total  (budget ${kib(BUDGET_BYTES)})`);

  // The basic Latin subset: what a Portuguese page downloads. The other
  // subsets ship too, but `unicode-range` fetches one only when a page uses a
  // character from it.
  const fonts = readdirSync(join(dir, 'assets')).filter((file) => /-latin-wght-.*\.woff2$/.test(file));
  const fontBytes = fonts.reduce((sum, file) => sum + statSync(join(dir, 'assets', file)).size, 0);
  console.log(
    `  ${kib(fontBytes).padStart(10)}  web fonts, Latin subsets (${fonts.length} files, not counted; loaded on use, non-blocking)`,
  );

  if (total > BUDGET_BYTES) {
    console.error(
      `\n[${name}] Bundle budget EXCEEDED by ${kib(total - BUDGET_BYTES)}. ` +
        `Split a route, drop a dependency, or raise the budget deliberately in ` +
        `scripts/check-bundle-size.mjs and frontend/README.md.`,
    );
    return false;
  }
  console.log(`[${name}] Within budget, ${kib(BUDGET_BYTES - total)} to spare.`);
  return true;
}

const present = BUILDS.filter((build) => existsSync(join(build.dir, 'index.html')));
if (present.length === 0) {
  console.error('No build found. Run `npm run build` or `npm run build:showcase` first.');
  process.exit(1);
}

const results = present.map(check);
if (results.includes(false)) process.exit(1);
