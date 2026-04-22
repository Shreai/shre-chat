import { defineConfig } from '@playwright/test';

const AUTH_FILE = '/tmp/shre-chat-auth.json';

/**
 * Multi-Agent QA Test Configuration
 *
 * 6 parallel test agents, each covering a distinct domain:
 *   Agent 1: Chat Core     — messaging, sessions, tabs, shortcuts
 *   Agent 2: Navigation    — views, sidebar, routing, responsive
 *   Agent 3: API Health    — endpoint availability, security headers
 *   Agent 4: Ecosystem     — app drawer, iframes, integrations
 *   Agent 5: Sidebar       — sessions, search, bookmarks
 *   Agent 6: Accessibility — a11y, edge cases, performance
 *   Agent 7: Preview       — multi-format rendering (existing)
 *
 * All agents depend on the auth setup project.
 * Results feed into qa-orchestrator.mjs for bug reporting.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'e2e/results/test-results.json' }],
    ['html', { outputFolder: 'e2e/results/html-report', open: 'never' }],
  ],
  outputDir: 'e2e/results/artifacts',
  fullyParallel: true,
  workers: 4,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5510',
    headless: true,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // ── Auth Setup (runs first) ──
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { browserName: 'chromium' },
    },

    // ── Agent 1: Chat Core ──
    {
      name: 'chat-core',
      testMatch: /chat-core\.spec\.ts/,
      use: { browserName: 'chromium', storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // ── Agent 2: Navigation ──
    {
      name: 'navigation',
      testMatch: /navigation\.spec\.ts/,
      use: { browserName: 'chromium', storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // ── Agent 3: API Health ──
    {
      name: 'api-health',
      testMatch: /api-health\.spec\.ts/,
      use: { browserName: 'chromium', storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // ── Agent 4: Ecosystem ──
    {
      name: 'ecosystem',
      testMatch: /ecosystem\.spec\.ts/,
      use: { browserName: 'chromium', storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // ── Agent 5: Sidebar ──
    {
      name: 'sidebar',
      testMatch: /sidebar\.spec\.ts/,
      use: { browserName: 'chromium', storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // ── Agent 6: Accessibility ──
    {
      name: 'accessibility',
      testMatch: /accessibility\.spec\.ts/,
      use: { browserName: 'chromium', storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // ── Agent 7: Preview (existing) ──
    {
      name: 'preview',
      testMatch: /preview\.spec\.ts/,
      use: { browserName: 'chromium', storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // ── Agent 8: Responsive & Device Testing ──
    {
      name: 'responsive',
      testMatch: /responsive\.spec\.ts/,
      use: { browserName: 'chromium', storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // ── Terminal — mobile, persistence, foldable ──
    {
      name: 'terminal',
      testMatch: /terminal\.spec\.ts/,
      use: { browserName: 'chromium', storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // ── Agent 9: Data Integration (POS ↔ RapidRMS ↔ Agent) ──
    {
      name: 'data-integration',
      testMatch: /data-integration\.spec\.ts/,
      use: { browserName: 'chromium', storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // ── Agent 10: Write Operations (POS item create, price update, stock adjust) ──
    {
      name: 'write-operations',
      testMatch: /write-operations\.spec\.ts/,
      use: { browserName: 'chromium', storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // ── Agent 11: Voice Features ──
    {
      name: 'voice',
      testMatch: /voice.*\.spec\.ts/,
      use: { browserName: 'chromium', storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // ── Smoke (existing, quick sanity) ──
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      use: { browserName: 'chromium', storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // ── Router Connection ──
    {
      name: 'router-connect',
      testMatch: /router-connect\.spec\.ts/,
      use: { browserName: 'chromium', storageState: AUTH_FILE },
      dependencies: ['setup'],
    },

    // ── Agent 12: EDI Import (extraction, mapping, chat routing) ──
    {
      name: 'edi-import',
      testMatch: /edi-import\.spec\.ts/,
      use: { browserName: 'chromium', storageState: AUTH_FILE },
      dependencies: ['setup'],
    },
  ],
  // Don't start a web server — assume shre-chat is already running on port 5510
});
