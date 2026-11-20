import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  // No retries: the smoke test must pass first time.
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
  // The build is served as GitHub Pages lays it out: one folder per version under /bot-areana/,
  // with switcher.json and a redirecting index.html at the root (npm run preview:site).
  use: {
    baseURL: 'http://localhost:4173/bot-areana/main/',
    viewport: { width: 1440, height: 900 },
    trace: 'on',
    screenshot: 'on',
  },
  // The full suite runs on Chromium; Firefox and WebKit run the smoke spec. CI runs one browser
  // per job (--project), so they run in parallel.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'firefox',
      testMatch: /smoke.*\.spec\.ts/,
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'webkit',
      testMatch: /smoke.*\.spec\.ts/,
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview:site -- --port 4173 --strictPort',
    url: 'http://localhost:4173/bot-areana/main/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
