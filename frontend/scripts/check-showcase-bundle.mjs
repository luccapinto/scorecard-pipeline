#!/usr/bin/env node
// Proves that the public showcase bundle does not CONTAIN API mode.
//
// Hiding API mode behind a flag would still ship it; the showcase build
// instead replaces `__SHOWCASE__` with a literal and lets the bundler delete
// every branch it guards (docs/adr/0006). This script checks the result in
// the built files themselves, so the claim cannot quietly rot:
//
//  1. SENTINELS — strings that exist only in API-mode modules (the CORS
//     diagnosis, the settings screen, the mode switch, the live status, the
//     API client) must not appear in any shipped JS or HTML.
//  2. NO FETCH — no `fetch(`, `XMLHttpRequest`, `EventSource`, `WebSocket` or
//     `sendBeacon` anywhere in the shipped JS. The demo makes no network
//     requests by construction; this is the byte-level version of that.
//  3. CONTROL — the same sentinels DO appear in the full build when one is
//     present, which proves the scan can actually see them.
//
// Run: npm run build:showcase && npm run check:showcase

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SHOWCASE_DIR = resolve(here, '../dist-showcase');
const FULL_DIR = resolve(here, '../dist');

/** [string, where it lives in the source] */
const SENTINELS = [
  ['Bloqueado por CORS', 'features/health/errorTaxonomy.ts — CORS diagnosis'],
  ['localhost:5173', 'features/health/errorTaxonomy.ts — backend CORS allowlist'],
  ['Taxonomia de erros', 'features/health/HealthView.tsx — live observability'],
  ['Troque para o modo API', 'features/health/HealthView.tsx — live observability'],
  ['Fonte de dados', 'components/shell/ModeSwitch.tsx — mode toggle'],
  ['API inacessível', 'components/shell/LiveStatus.tsx — API liveness'],
  ['scorecard-pipeline.config', 'config/settings.ts — stored URL and key'],
  ['Configurar a API', 'App.tsx — settings link'],
  ['URL base', 'features/settings/SettingsView.tsx — settings form'],
  ['X-API-Key', 'api/client.ts and api/errors.ts — the API key header'],
];

const NETWORK = [/\bfetch\(/, /XMLHttpRequest/, /\bEventSource\b/, /\bWebSocket\b/, /sendBeacon/];

function shippedFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...shippedFiles(full));
    else if (/\.(js|html)$/.test(entry)) found.push(full);
  }
  return found;
}

function scan(dir) {
  const hits = new Map();
  const network = [];
  for (const file of shippedFiles(dir)) {
    const text = readFileSync(file, 'utf8');
    for (const [needle] of SENTINELS) {
      if (text.includes(needle)) hits.set(needle, [...(hits.get(needle) ?? []), relative(dir, file)]);
    }
    if (file.endsWith('.js')) {
      for (const pattern of NETWORK) {
        if (pattern.test(text)) network.push(`${relative(dir, file)} :: ${pattern.source}`);
      }
    }
  }
  return { hits, network };
}

if (!existsSync(join(SHOWCASE_DIR, 'index.html'))) {
  console.error(`No showcase build at ${SHOWCASE_DIR}. Run \`npm run build:showcase\` first.`);
  process.exit(1);
}

const showcase = scan(SHOWCASE_DIR);
let failed = false;

for (const [needle, where] of SENTINELS) {
  const files = showcase.hits.get(needle);
  if (files === undefined) {
    console.log(`✓ absent: "${needle}"  (${where})`);
  } else {
    failed = true;
    console.error(`✗ PRESENT: "${needle}" in ${files.join(', ')}  (${where})`);
  }
}

if (showcase.network.length === 0) {
  console.log('✓ no network primitive (fetch, XMLHttpRequest, EventSource, WebSocket, sendBeacon)');
} else {
  failed = true;
  for (const line of showcase.network) console.error(`✗ network primitive: ${line}`);
}

// The control: a scan that finds nothing anywhere proves nothing.
if (existsSync(join(FULL_DIR, 'index.html'))) {
  const full = scan(FULL_DIR);
  const seen = SENTINELS.filter(([needle]) => full.hits.has(needle)).length;
  if (seen !== SENTINELS.length) {
    failed = true;
    const missing = SENTINELS.filter(([needle]) => !full.hits.has(needle)).map(([needle]) => needle);
    console.error(`✗ control: sentinels missing from the full build (the scan is blind to them): ${missing.join(', ')}`);
  } else {
    console.log(`✓ control: ${seen}/${SENTINELS.length} sentinels found in the full build (dist/).`);
  }
} else {
  console.log('· control skipped: no full build in dist/ (run `npm run build` to include it).');
}

if (failed) {
  console.error('\nShowcase bundle check FAILED: API-mode code reached the public bundle.');
  process.exit(1);
}
console.log('\nShowcase bundle check passed: API mode is not in the public bundle.');
