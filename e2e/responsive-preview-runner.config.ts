import { defineConfig } from '@playwright/test';

/**
 * Standalone config for responsive preview tests.
 * Uses HTTP (not HTTPS) since shre-chat runs on HTTP locally.
 * No auth setup dependency — tests public endpoints and main page.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /responsive-preview\.spec\.ts/,
  timeout: 90_000,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'e2e/results/responsive-preview-results.json' }],
  ],
  outputDir: 'e2e/results/artifacts',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5510',
    headless: true,
    ignoreHTTPSErrors: true,
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
});
