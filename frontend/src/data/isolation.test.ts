// Architectural invariants, enforced as tests.
//
// Two rules hold the whole design together, and both are the kind of rule that
// erodes silently during a busy afternoon. So they are checked, not documented:
//
//  1. Only `data/apiSource.ts` may import `api/client`. If a component reaches
//     for the network directly, demo mode stops being network-free and the
//     guarantee in the README becomes a lie.
//  2. Nothing outside `demo/` and the single lazy import in `App.tsx` may
//     import from `demo/`. That keeps the dependency direction one-way, which
//     is what lets the demo be code-split out of the initial bundle.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

/** Module specifiers of every static and dynamic import in a file. */
function importsOf(code: string): string[] {
  const specifiers: string[] = [];
  const staticImport = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
  const dynamicImport = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const pattern of [staticImport, dynamicImport]) {
    let match = pattern.exec(code);
    while (match !== null) {
      specifiers.push(match[1]);
      match = pattern.exec(code);
    }
  }
  return specifiers;
}

/** Removes block and line comments so prose about `fetch` is not a finding. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path).replaceAll('\\', '/'),
  imports: importsOf(readFileSync(path, 'utf8')),
}));

describe('architecture', () => {
  it('finds source files to inspect', () => {
    // Guards against the walker silently matching nothing, which would make
    // every assertion below vacuously true.
    expect(files.length).toBeGreaterThan(20);
  });

  it('routes all network access through data/apiSource', () => {
    const offenders = files
      .filter((file) => file.path !== 'data/apiSource.ts')
      // Match the module regardless of how it is spelled: with or without an
      // extension, and through a barrel that re-exports it.
      .filter((file) => file.imports.some((spec) => /(^|\/)api\/client(\.tsx?)?$/.test(spec)))
      .map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  it('never reaches the network without going through the client', () => {
    // The import-graph rule above is necessary but not sufficient: a
    // component that writes `fetch(url)` imports nothing and would sail
    // through it, quietly voiding the demo's zero-network guarantee. This
    // checks the source text for every primitive that can open a connection.
    const PRIMITIVES = [
      /\bfetch\s*\(/,
      /\bnew\s+XMLHttpRequest\b/,
      /\bnew\s+EventSource\b/,
      /\bnew\s+WebSocket\b/,
      /\bnavigator\s*\.\s*sendBeacon\b/,
      /\bnavigator\s*\.\s*serviceWorker\b/,
      /\bimport\s*\(\s*['"]https?:/,
    ];

    // `api/client.ts` is the one place allowed to call fetch. `api/telemetry`
    // only measures it. Nothing else may.
    const ALLOWED: Record<string, true> = { 'api/client.ts': true };

    const offenders: string[] = [];
    for (const file of files) {
      if (ALLOWED[file.path]) continue;
      // Comments discuss these primitives by name all over the codebase
      // (explaining why fetch rejects on CORS, for instance). Scanning raw
      // text would flag prose, and a guard that cries wolf gets an allowlist
      // bolted on until it means nothing.
      const code = stripComments(readFileSync(join(SRC, file.path), 'utf8'));
      for (const pattern of PRIMITIVES) {
        if (pattern.test(code)) offenders.push(`${file.path} :: ${pattern.source}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the demo dependency direction one-way', () => {
    const offenders = files
      .filter((file) => !file.path.startsWith('demo/') && file.path !== 'App.tsx')
      .filter((file) => file.imports.some((spec) => spec.includes('demo/')))
      .map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  it('imports the demo lazily, so it stays out of the initial bundle', () => {
    const app = files.find((file) => file.path === 'App.tsx');
    expect(app).toBeDefined();

    const code = readFileSync(join(SRC, 'App.tsx'), 'utf8');
    const staticDemoImport = /(?:^|\n)\s*import[\s\S]*?from\s+['"][^'"]*demo\/[^'"]*['"]/.test(
      code,
    );
    expect(staticDemoImport).toBe(false);
    expect(/import\(\s*['"][^'"]*demo\//.test(code)).toBe(true);
  });
});
