import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

// Relative base so one build works from any folder: GitHub Pages serves each version from its own
// subfolder (https://gilesknap.github.io/bot-areana/main/, .../v0.1.0/ and so on).
// APP_VERSION is set by CI (tag name, or main-<sha>); local builds fall back to dev-<sha>.
function appVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    return `dev-${execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()}`;
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // The Code & Arena screen is loaded lazily (src/ui/app.ts). Phaser gets a chunk of its own so
    // it stays cached across app releases; it alone is over Vite's 500 kB warning size.
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'phaser', test: /node_modules[\\/]phaser[\\/]/ }] } },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Pyodide start-up plus whole-level runs are slow-ish.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
