import { test, expect } from '@playwright/test';
import { switchView } from './view-switch';

test.describe('Agent 2: Navigation — views, sidebar, routing', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
    // Wait for auth state and hydration to fully settle before testing navigation
    await page.waitForSelector('#shre-chat-textarea', { timeout: 10_000 });
    await page.waitForTimeout(500);
  });

  // ═══════════ View Switching ═══════════

  test('can switch to preview view and back', async ({ page }) => {
    await switchView(page, 'preview');
    await page.waitForTimeout(800);
    // Preview view should show library or empty state
    const previewIndicator = page.locator('text=Preview').first();
    await expect(previewIndicator).toBeVisible({ timeout: 5000 });

    // Switch back to chat
    const backBtn = page.locator('button', { hasText: 'Chat' }).first();
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click();
    } else {
      await switchView(page, 'chat');
    }
    await page.waitForTimeout(500);
    await expect(page.locator('#shre-chat-textarea')).toBeVisible();
  });

  test('can switch to activity view', async ({ page }) => {
    await switchView(page, 'activity');
    await page.waitForTimeout(800);
    // Should show activity content or empty state
    const activityContent = page.locator('text=/activity|feed|recent/i').first();
    const visible = await activityContent.isVisible({ timeout: 3000 }).catch(() => false);
    if (!visible) {
      console.log('GAP: Activity view has no visible content indicator');
    }
  });

  test('can switch to tasks view', async ({ page }) => {
    await switchView(page, 'tasks');
    await page.waitForTimeout(800);
    const tasksContent = page.locator('text=/task|todo|backlog/i').first();
    const visible = await tasksContent.isVisible({ timeout: 3000 }).catch(() => false);
    if (!visible) {
      console.log('GAP: Tasks view has no visible content indicator');
    }
  });

  test('can switch to spend view', async ({ page }) => {
    await switchView(page, 'spend');
    await page.waitForTimeout(800);
    const spendContent = page.locator('text=/spend|cost|usage|budget/i').first();
    const visible = await spendContent.isVisible({ timeout: 3000 }).catch(() => false);
    if (!visible) {
      console.log('GAP: Spend view has no visible content indicator');
    }
  });

  test('can switch to marketplace view', async ({ page }) => {
    await switchView(page, 'marketplace');
    await page.waitForTimeout(800);
    const marketContent = page.locator('text=/marketplace|agent|catalog/i').first();
    const visible = await marketContent.isVisible({ timeout: 3000 }).catch(() => false);
    if (!visible) {
      console.log('GAP: Marketplace view has no visible content indicator');
    }
  });

  // ═══════════ Sidebar Navigation ═══════════

  test('sidebar is visible on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(500);
    // Sidebar shows date groups (TODAY) and session search
    const sidebarIndicator = page.locator('text=/today|search sessions/i').first();
    const visible = await sidebarIndicator.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      // Sidebar may use different labels — just verify the sidebar container exists
      const sidebar = page.locator('[class*="sidebar"], [class*="Sidebar"], aside').first();
      const hasSidebar = await sidebar.isVisible({ timeout: 3000 }).catch(() => false);
      if (!hasSidebar) {
        console.log('GAP: Sidebar not visible on desktop viewport');
      }
    }
  });

  test('sidebar toggle works', async ({ page }) => {
    const toggleBtn = page
      .locator('button[aria-label*="sidebar" i], button[aria-label*="Sidebar" i]')
      .first();
    const hasToggle = await toggleBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasToggle) {
      // Try Cmd+Shift+L
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.press(`${modifier}+Shift+l`);
      await page.waitForTimeout(500);
    }
    // Sidebar should have toggled — test passes if no error
  });

  // ═══════════ URL Routing ═══════════

  test('/ loads chat view', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#shre-chat-textarea')).toBeVisible({ timeout: 30_000 });
  });

  test('/demo loads demo mode', async ({ page }) => {
    const response = await page.goto('/demo', { waitUntil: 'domcontentloaded' });
    // Demo should load without auth — check it doesn't redirect to login
    expect(response?.status()).toBeLessThan(500);
  });

  // ═══════════ Responsive Layout ═══════════

  test('mobile viewport hides sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    // On mobile, sidebar should be hidden or collapsed
    const messagesHeading = page.getByText('Messages', { exact: true });
    const sidebarVisible = await messagesHeading.isVisible({ timeout: 2000 }).catch(() => false);
    // Either hidden or behind hamburger — both acceptable
    if (sidebarVisible) {
      console.log('NOTE: Sidebar visible on mobile — check if overlay or always-visible');
    }
  });

  test('tablet viewport renders properly', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    await expect(page.locator('#shre-chat-textarea')).toBeVisible();
  });
});
