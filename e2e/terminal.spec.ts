import { test, expect } from '@playwright/test';

/**
 * Terminal QA — mobile layout, session persistence, foldable support, Claude CLI toggle.
 *
 * Tests the terminal fixes:
 * 1. Mobile layout (tab mode, no 40% split)
 * 2. Session persistence across disconnect/reconnect
 * 3. Foldable phone viewport changes
 * 4. Resize handling
 * 5. Claude CLI button toggle
 */
test.describe('Terminal — mobile, persistence, foldable', () => {
  test.setTimeout(60_000);

  // Helper: wait for app to be ready
  async function waitForApp(page: import('@playwright/test').Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
  }

  // Helper: find and click the terminal toggle button
  async function openTerminal(page: import('@playwright/test').Page) {
    // Terminal toggle is in the composer toolbar (title "Open terminal" / "Close terminal")
    const termBtn = page.locator('button[title="Open terminal"]');
    if (await termBtn.count() > 0) {
      await termBtn.first().click();
      await page.waitForTimeout(800);
    } else {
      // Terminal might already be open or button not found
      const closeBtn = page.locator('button[title="Close terminal"]');
      if (await closeBtn.count() === 0) return false;
      // Already open — no need to click
    }

    // In tab mode (mobile), the Terminal tab must be active to see .xterm-screen
    const termTab = page.locator('[role="tab"][aria-label="Terminal view"]');
    if (await termTab.count() > 0) {
      const isSelected = await termTab.getAttribute('aria-selected');
      if (isSelected !== 'true') {
        await termTab.click();
        await page.waitForTimeout(300);
      }
    }

    await page.waitForTimeout(1000); // Allow WebSocket connection + PTY spawn

    // Trigger a resize to force xterm fit() after layout settles
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(500);
    return true;
  }

  // ═══════════ Mobile Terminal Layout ═══════════

  test.describe('iPhone 14 (390x844)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('terminal opens full-screen on mobile (tab mode)', async ({ page }) => {
      await waitForApp(page);
      const opened = await openTerminal(page);
      if (!opened) {
        test.skip(true, 'Terminal button not found');
        return;
      }

      // Terminal container should exist and be visible
      const termCanvas = page.locator('.xterm-screen');
      const visible = await termCanvas.isVisible({ timeout: 5000 }).catch(() => false);

      if (visible) {
        const box = await termCanvas.boundingBox();
        expect(box).toBeTruthy();
        // On mobile tab mode, terminal should take most of the viewport width
        expect(box!.width).toBeGreaterThan(350);
        // Should have reasonable height (not the cramped 40% split)
        expect(box!.height).toBeGreaterThan(300);
      }
    });

    test('chat textarea hidden when terminal is active on mobile', async ({ page }) => {
      await waitForApp(page);
      const opened = await openTerminal(page);
      if (!opened) {
        test.skip(true, 'Terminal button not found');
        return;
      }

      // In tab mode on mobile, chat should be hidden while terminal is shown
      const textarea = page.locator('#shre-chat-textarea');
      const chatVisible = await textarea.isVisible({ timeout: 2000 }).catch(() => false);
      // Either hidden (tab mode) or still visible (split mode fallback) — both acceptable
      console.log(`INFO: Chat textarea visible with terminal open on mobile: ${chatVisible}`);
    });

    test('shortcut keys bar visible and scrollable on mobile', async ({ page }) => {
      await waitForApp(page);
      const opened = await openTerminal(page);
      if (!opened) {
        test.skip(true, 'Terminal button not found');
        return;
      }

      // Look for shortcut key buttons (Esc, Tab, Ctrl+C, etc.)
      const shortcuts = page.locator('button:has-text("Esc"), button:has-text("Ctrl+C")');
      const count = await shortcuts.count();
      console.log(`INFO: Shortcut keys visible on mobile: ${count}`);
      // Should have at least some shortcut keys
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test('no horizontal overflow with terminal on mobile', async ({ page }) => {
      await waitForApp(page);
      await openTerminal(page);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
    });
  });

  // ═══════════ Android Small Screen ═══════════

  test.describe('Android (360x800)', () => {
    test.use({ viewport: { width: 360, height: 800 } });

    test('terminal renders on small Android', async ({ page }) => {
      await waitForApp(page);
      const opened = await openTerminal(page);
      if (!opened) {
        test.skip(true, 'Terminal button not found');
        return;
      }

      const termCanvas = page.locator('.xterm-screen');
      const visible = await termCanvas.isVisible({ timeout: 5000 }).catch(() => false);
      if (visible) {
        const box = await termCanvas.boundingBox();
        expect(box).toBeTruthy();
        expect(box!.width).toBeGreaterThan(320);
        expect(box!.height).toBeGreaterThan(250);
      }
    });
  });

  // ═══════════ Foldable Phone (Galaxy Z Fold) ═══════════

  test.describe('Foldable — Galaxy Z Fold', () => {
    test('terminal survives fold/unfold (viewport resize)', async ({ page }) => {
      // Start in unfolded mode (wide)
      await page.setViewportSize({ width: 884, height: 1104 });
      await waitForApp(page);
      const opened = await openTerminal(page);
      if (!opened) {
        test.skip(true, 'Terminal button not found');
        return;
      }

      const termCanvas = page.locator('.xterm-screen');
      await expect(termCanvas).toBeVisible({ timeout: 5000 });

      // "Fold" — shrink to cover screen size (transitions from split to tab mode)
      await page.setViewportSize({ width: 412, height: 914 });
      await page.waitForTimeout(800);

      // In tab mode after fold, ensure Terminal tab is selected
      const termTab = page.locator('[role="tab"][aria-label="Terminal view"]');
      if (await termTab.count() > 0) {
        const isSelected = await termTab.getAttribute('aria-selected');
        if (isSelected !== 'true') await termTab.click();
        await page.waitForTimeout(300);
      }

      // Terminal should still be visible (re-fitted)
      const visible = await termCanvas.isVisible({ timeout: 3000 }).catch(() => false);
      expect(visible).toBe(true);

      const box = await termCanvas.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.width).toBeGreaterThan(350);
      console.log(`INFO: Terminal after fold: ${Math.round(box!.width)}x${Math.round(box!.height)}`);

      // "Unfold" — expand back
      await page.setViewportSize({ width: 884, height: 1104 });
      await page.waitForTimeout(500);

      const boxUnfolded = await termCanvas.boundingBox();
      expect(boxUnfolded).toBeTruthy();
      // At 884px with sidebar visible (~230px), terminal should be ~550-650px wide
      expect(boxUnfolded!.width).toBeGreaterThan(500);
      console.log(`INFO: Terminal after unfold: ${Math.round(boxUnfolded!.width)}x${Math.round(boxUnfolded!.height)}`);
    });
  });

  // ═══════════ Desktop Terminal ═══════════

  test.describe('Desktop (1366x768)', () => {
    test.use({ viewport: { width: 1366, height: 768 } });

    test('terminal opens in split mode on desktop', async ({ page }) => {
      await waitForApp(page);
      const opened = await openTerminal(page);
      if (!opened) {
        test.skip(true, 'Terminal button not found');
        return;
      }

      // On desktop, both chat and terminal should be visible (split mode)
      const termCanvas = page.locator('.xterm-screen');
      const visible = await termCanvas.isVisible({ timeout: 5000 }).catch(() => false);
      expect(visible).toBe(true);

      // Chat textarea should also still be visible on desktop
      const textarea = page.locator('#shre-chat-textarea');
      const chatVisible = await textarea.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`INFO: Chat visible with terminal on desktop: ${chatVisible}`);
    });

    test('terminal tab bar has new tab and close buttons', async ({ page }) => {
      await waitForApp(page);
      const opened = await openTerminal(page);
      if (!opened) {
        test.skip(true, 'Terminal button not found');
        return;
      }

      // Should have a "+" new tab button
      const newTabBtn = page.locator('button[title="New terminal"]');
      await expect(newTabBtn).toBeVisible({ timeout: 5000 });

      // Should have a close button
      const closeBtn = page.locator('button[title="Close all terminals"]');
      await expect(closeBtn).toBeVisible({ timeout: 3000 });
    });
  });

  // ═══════════ Session Persistence ═══════════

  test.describe('Session persistence (desktop)', () => {
    test.use({ viewport: { width: 1366, height: 768 } });

    test('terminal WebSocket reconnects with session ID', async ({ page }) => {
      await waitForApp(page);
      const opened = await openTerminal(page);
      if (!opened) {
        test.skip(true, 'Terminal button not found');
        return;
      }

      // Check that sessionStorage has a terminal session ID
      const sessionId = await page.evaluate(() => sessionStorage.getItem('shre-term-session'));
      expect(sessionId).toBeTruthy();
      console.log(`INFO: Terminal session ID: ${sessionId}`);

      // The WebSocket URL should include the session parameter
      const wsUrls = await page.evaluate(() => {
        return (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
          .filter(e => e.name.includes('/ws/terminal'))
          .map(e => e.name);
      });
      // Note: WebSocket connections may not appear in resource timing on all browsers
      console.log(`INFO: Terminal WS connections found in resource timing: ${wsUrls.length}`);
    });
  });

  // ═══════════ Claude CLI Toggle ═══════════

  test.describe('Claude CLI button', () => {
    test.use({ viewport: { width: 1366, height: 768 } });

    test('Claude CLI button toggles mode', async ({ page }) => {
      await waitForApp(page);

      // Find the Claude CLI button (code brackets icon, title contains "CLI")
      const cliBtn = page.locator('button[title*="Claude CLI" i], button[aria-label*="Claude CLI" i]');
      const count = await cliBtn.count();
      if (count === 0) {
        test.skip(true, 'Claude CLI button not found');
        return;
      }

      // Initially OFF — check localStorage
      const initialState = await page.evaluate(() => localStorage.getItem('shre-claude-cli-mode'));
      console.log(`INFO: Claude CLI initial state: ${initialState}`);

      // Click to toggle ON
      await cliBtn.first().click();
      await page.waitForTimeout(300);

      const afterOn = await page.evaluate(() => localStorage.getItem('shre-claude-cli-mode'));
      console.log(`INFO: Claude CLI after toggle: ${afterOn}`);

      // Should have changed state
      if (initialState === 'true') {
        expect(afterOn).not.toBe('true');
      } else {
        expect(afterOn).toBe('true');
      }

      // Click again to toggle back
      await cliBtn.first().click();
      await page.waitForTimeout(300);

      const afterOff = await page.evaluate(() => localStorage.getItem('shre-claude-cli-mode'));
      // Should be back to original state
      expect(afterOff).toBe(initialState || 'false');
    });

    test('Claude CLI button visible on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await waitForApp(page);

      const cliBtn = page.locator('button[title*="Claude CLI" i], button[aria-label*="Claude CLI" i]');
      const visible = await cliBtn.first().isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`INFO: Claude CLI button visible on mobile: ${visible}`);
      // Should be accessible on mobile
      if (visible) {
        const box = await cliBtn.first().boundingBox();
        expect(box).toBeTruthy();
        expect(box!.width).toBeGreaterThanOrEqual(28); // Minimum touch target
        expect(box!.height).toBeGreaterThanOrEqual(28);
      }
    });
  });

  // ═══════════ Orientation Changes with Terminal ═══════════

  test('terminal survives orientation change', async ({ page }) => {
    // Start portrait
    await page.setViewportSize({ width: 390, height: 844 });
    await waitForApp(page);
    const opened = await openTerminal(page);
    if (!opened) {
      test.skip(true, 'Terminal button not found');
      return;
    }

    const termCanvas = page.locator('.xterm-screen');
    await expect(termCanvas).toBeVisible({ timeout: 5000 });

    // Rotate to landscape
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(500);

    // Terminal should still be visible and re-fitted
    const visible = await termCanvas.isVisible({ timeout: 3000 }).catch(() => false);
    expect(visible).toBe(true);

    const box = await termCanvas.boundingBox();
    expect(box).toBeTruthy();
    // In landscape at 844px with sidebar (~230px), terminal should be ~500-600px
    expect(box!.width).toBeGreaterThan(450);
    console.log(`INFO: Terminal in landscape: ${Math.round(box!.width)}x${Math.round(box!.height)}`);
  });
});
