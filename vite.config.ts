import { defineConfig } from 'vitest/config';

// Served from https://gilesknap.github.io/bot-areana/ on GitHub Pages.
export default defineConfig({
  base: '/bot-areana/',
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Pyodide start-up plus whole-level runs are slow-ish.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
