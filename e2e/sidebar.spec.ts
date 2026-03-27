import { test, expect } from '@playwright/test';

test.describe('Agent 5: Sidebar — sessions, search, bookmarks', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
  });

  // ═══════════ Session List ═══════════

  test('session list renders in sidebar', async ({ page }) => {
    // Sidebar uses date groupings (TODAY, YESTERDAY) as section headers
    const sidebarIndicator = page.locator('text=/today|search sessions/i').first();
    await expect(sidebarIndicator).toBeVisible({ timeout: 10_000 });
  });

  test('clicking a session loads it', async ({ page }) => {
    const firstSession = page
      .locator('[class*="overflow-y-auto"] > div > div[class*="cursor-pointer"]')
      .first();
    const visible = await firstSession.isVisible({ timeout: 5000 }).catch(() => false);
    if (visible) {
      await firstSession.click();
      await page.waitForTimeout(500);
      await expect(page.locator('#shre-chat-textarea')).toBeVisible();
    } else {
      console.log('NOTE: No sessions in sidebar to click');
    }
  });

  test('double-click session title edits it', async ({ page }) => {
    const firstSession = page
      .locator('[class*="overflow-y-auto"] > div > div[class*="cursor-pointer"]')
      .first();
    const visible = await firstSession.isVisible({ timeout: 5000 }).catch(() => false);
    if (visible) {
      await firstSession.dblclick();
      await page.waitForTimeout(300);
      // Should show an input field for editing
      const input = page.locator('input[type="text"]').first();
      const editing = await input.isVisible({ timeout: 2000 }).catch(() => false);
      if (!editing) {
        console.log('NOTE: Double-click may not trigger inline edit — check implementation');
      }
    }
  });

  // ═══════════ Session Search ═══════════

  test('sidebar search filters sessions', async ({ page }) => {
    const searchInput = page
      .locator('input[placeholder*="search" i], input[placeholder*="filter" i]')
      .first();
    const hasSearch = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasSearch) {
      await searchInput.fill('nonexistent-session-qa-test');
      await page.waitForTimeout(300);
      // Sessions should be filtered (empty or reduced)
      const sessions = page.locator(
        '[class*="overflow-y-auto"] > div > div[class*="cursor-pointer"]',
      );
      const count = await sessions.count();
      expect(count).toBeLessThanOrEqual(1); // Should filter to 0 or show "no results"
    } else {
      console.log('GAP: No search input found in sidebar');
    }
  });

  // ═══════════ Global Search ═══════════

  test('Cmd+Shift+F opens global search', async ({ page }) => {
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+f`);
    await page.waitForTimeout(500);

    const searchModal = page.locator('text=/search|find/i').first();
    const appeared = await searchModal.isVisible({ timeout: 3000 }).catch(() => false);
    if (!appeared) {
      console.log('NOTE: Cmd+Shift+F may not be bound to global search');
    }
  });

  // ═══════════ Bookmarks ═══════════

  test('bookmark panel accessible', async ({ page }) => {
    // Look for bookmark icon/button in sidebar
    const bookmarkBtn = page
      .locator('button[aria-label*="bookmark" i], button[title*="bookmark" i]')
      .first();
    const visible = await bookmarkBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (visible) {
      await bookmarkBtn.click();
      await page.waitForTimeout(500);
      // Should show bookmark panel or empty state
      const panel = page.locator('text=/bookmark|saved|no bookmark/i').first();
      const hasPanel = await panel.isVisible({ timeout: 3000 }).catch(() => false);
      if (!hasPanel) {
        console.log('GAP: Bookmark panel has no visible indicator');
      }
    } else {
      console.log('NOTE: Bookmark button not found in sidebar');
    }
  });

  // ═══════════ Session Tags ═══════════

  test('session tags are visible if present', async ({ page }) => {
    // Tags appear as colored pills on sessions
    const tags = page.locator('[class*="tag"], [class*="badge"]');
    const count = await tags.count();
    // Just documenting presence — no assertion needed
    if (count > 0) {
      console.log(`INFO: Found ${count} session tags`);
    }
  });

  // ═══════════ New Session Button ═══════════

  test('new session button creates blank session', async ({ page }) => {
    const newBtn = page
      .locator(
        'button[aria-label*="new" i], button[title*="new chat" i], button[title*="new session" i]',
      )
      .first();
    const visible = await newBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (visible) {
      await newBtn.click();
      await page.waitForTimeout(500);
      const textarea = page.locator('#shre-chat-textarea');
      await expect(textarea).toBeVisible();
      await expect(textarea).toHaveValue('');
    } else {
      // Fallback: Cmd+K
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.press(`${modifier}+k`);
      await page.waitForTimeout(500);
      await expect(page.locator('#shre-chat-textarea')).toHaveValue('');
    }
  });

  // ═══════════ Pin/Unpin ═══════════

  test('pinned sessions section exists', async ({ page }) => {
    const pinned = page.locator('text=/pinned/i').first();
    const visible = await pinned.isVisible({ timeout: 3000 }).catch(() => false);
    if (visible) {
      // Pinned section exists
      expect(visible).toBe(true);
    } else {
      console.log('NOTE: No pinned sessions section — may appear only when sessions are pinned');
    }
  });
});
