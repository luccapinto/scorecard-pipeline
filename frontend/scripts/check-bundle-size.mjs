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
// Run: npm run check:size   (after npm run build)

import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, '../dist');
const INDEX = join(DIST, 'index.html');

/** Budget in bytes, gzipped. Stated in frontend/README.md. */
const BUDGET_BYTES = 180 * 1024;

if (!existsSync(INDEX)) {
  console.error(`No build found at ${INDEX}. Run \`npm run build\` first.`);
  process.exit(1);
}

const html = readFileSync(INDEX, 'utf8');

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
  console.error('index.html references no assets — the size check would be vacuous.');
  process.exit(1);
}

const rows = [{ file: 'index.html', gzip: gzipSync(Buffer.from(html)).length }];
for (const asset of [...referenced].sort()) {
  const path = join(DIST, asset);
  if (!existsSync(path)) {
    console.error(`index.html references a missing asset: ${asset}`);
    process.exit(1);
  }
  rows.push({ file: asset, gzip: gzipSync(readFileSync(path)).length });
}

const total = rows.reduce((sum, row) => sum + row.gzip, 0);
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

console.log('Initial load (gzipped):');
for (const row of rows) {
  console.log(`  ${kib(row.gzip).padStart(10)}  ${row.file}`);
}
console.log(`  ${'—'.repeat(10)}`);
console.log(`  ${kib(total).padStart(10)}  total  (budget ${kib(BUDGET_BYTES)})`);

if (total > BUDGET_BYTES) {
  console.error(
    `\nBundle budget EXCEEDED by ${kib(total - BUDGET_BYTES)}. ` +
      `Split a route, drop a dependency, or raise the budget deliberately in ` +
      `scripts/check-bundle-size.mjs and frontend/README.md.`,
  );
  process.exit(1);
}

console.log(`\nWithin budget, ${kib(BUDGET_BYTES - total)} to spare.`);
