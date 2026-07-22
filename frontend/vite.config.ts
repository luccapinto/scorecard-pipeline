/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// base: './' keeps asset URLs relative so the built SPA works when nginx
// serves it from any path (see frontend/nginx.conf). The dev server must run
// on 5173 because the backend CORS allowlist is hardcoded to that origin
// (app/main.py).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
  },
});
