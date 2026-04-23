import { test, expect } from '@playwright/test';

/**
 * Visual regression baseline — Playwright's built-in toHaveScreenshot.
 *
 * First run writes reference images to `e2e/__screenshots__/visual-regression.spec.ts-snapshots/`.
 * Subsequent runs compare; differences over `maxDiffPixelRatio` fail the test.
 *
 * When intentional UI changes land:
 *   pnpm exec playwright test visual-regression --update-snapshots
 *
 * Masks time-sensitive regions (clock, active-agent pills, streaming
 * indicators) to keep the baseline stable across runs.
 */
test.describe('Visual regression', () => {
  test.setTimeout(45_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
    // Settle: wait for fonts + any entrance animations.
    await page.waitForTimeout(500);
  });

  test('main chat view (empty state)', async ({ page }) => {
    await expect(page).toHaveScreenshot('chat-empty.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
      mask: [
        // Countdown timers, live agent counts, pending task badges rotate.
        page.locator('[data-testid="status-bar-countdown"]'),
        page.locator('[data-testid="status-bar-agent-count"]'),
        page.locator('[data-testid="status-bar-task-count"]'),
      ],
    });
  });

  test('status bar baseline', async ({ page }) => {
    const statusBar = page.locator('.status-bar').first();
    await expect(statusBar).toBeVisible();
    await expect(statusBar).toHaveScreenshot('status-bar.png', {
      maxDiffPixelRatio: 0.03,
      mask: [
        page.locator('[data-testid="status-bar-countdown"]'),
        page.locator('[data-testid="status-bar-agent-count"]'),
        page.locator('[data-testid="status-bar-task-count"]'),
      ],
    });
  });

  test('sidebar open', async ({ page }) => {
    const hamburger = page
      .locator('button[aria-label*="sidebar" i], button[aria-label*="menu" i]')
      .first();
    const sidebar = page.locator('.sidebar-panel, [data-testid="sidebar"]').first();
    if (!(await sidebar.isVisible().catch(() => false))) {
      if (await hamburger.isVisible().catch(() => false)) {
        await hamburger.click();
        await page.waitForTimeout(400);
      }
    }
    if (await sidebar.isVisible().catch(() => false)) {
      await expect(sidebar).toHaveScreenshot('sidebar-open.png', {
        maxDiffPixelRatio: 0.02,
      });
    } else {
      test.skip(true, 'Sidebar not renderable at default viewport; skipping baseline');
    }
  });
});
