/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Two build targets from one source tree (see docs/adr/0006):
//
//  * the default build — served by docker compose / `npm run dev` to someone
//    who runs the backend — has both modes, API and demonstration;
//  * `vite build --mode showcase` — the public GitHub Pages demo — has ONLY
//    the demonstration. `__SHOWCASE__` is replaced by a literal at build time,
//    so every `if (!SHOWCASE)` branch is constant-folded away and the modules
//    only it reached (network client, settings screen, CORS diagnosis) are
//    tree-shaken out of the bundle. scripts/check-showcase-bundle.mjs proves it.
//
// base: './' keeps asset URLs relative so the built SPA works when nginx
// serves it from any path (see frontend/nginx.conf) and at the Pages subpath.
// The dev server must run on 5173 because the backend CORS allowlist is
// hardcoded to that origin (app/main.py).
export default defineConfig(({ mode }) => {
  const showcase = mode === 'showcase';
  return {
    plugins: [react()],
    base: './',
    define: { __SHOWCASE__: JSON.stringify(showcase) },
    server: {
      port: 5173,
      strictPort: true,
    },
    build: {
      outDir: showcase ? 'dist-showcase' : 'dist',
      emptyOutDir: true,
      // Every browser the app targets implements <link rel=modulepreload>
      // natively. The polyfill is the only `fetch()` Vite would inject, and
      // without it the showcase bundle contains no fetch call at all — which
      // scripts/check-showcase-bundle.mjs asserts.
      modulePreload: { polyfill: false },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      css: false,
      // Two projects: `app` is the full build; `showcase` compiles the app
      // with the showcase constant on, which is the only way to test what the
      // public bundle actually does rather than a runtime imitation of it.
      projects: [
        {
          extends: true,
          test: {
            name: 'app',
            exclude: ['**/node_modules/**', '**/*.showcase.test.{ts,tsx}'],
          },
        },
        {
          extends: true,
          define: { __SHOWCASE__: 'true' },
          test: {
            name: 'showcase',
            include: ['src/**/*.showcase.test.{ts,tsx}'],
          },
        },
      ],
    },
  };
});
