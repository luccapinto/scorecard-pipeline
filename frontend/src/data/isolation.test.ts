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
      .filter((file) => file.imports.some((spec) => /(^|\/)api\/client$/.test(spec)))
      .map((file) => file.path);

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
