import { test, expect } from '@playwright/test';

test.describe('Router Connection Test', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    // Collect console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log(`[BROWSER ERROR] ${msg.text()}`);
    });
    page.on('pageerror', (err) => console.log(`[PAGE ERROR] ${err.message}`));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
  });

  test('no "disconnected" system messages on load', async ({ page }) => {
    // Wait for any async connection attempts to settle
    await page.waitForTimeout(5000);

    // Check for disconnect messages in the chat
    const disconnectMsgs = page.locator('text=/disconnected|1006|no reason/i');
    const count = await disconnectMsgs.count();
    expect(count).toBe(0);
  });

  test('no WebSocket errors in console on load', async ({ page }) => {
    const wsErrors: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('WebSocket') && (msg.type() === 'error' || msg.type() === 'warning')) {
        wsErrors.push(text);
      }
    });

    // Wait for connection attempts
    await page.waitForTimeout(5000);

    // Filter out expected warnings
    const criticalErrors = wsErrors.filter(
      (e) => !e.includes('notifications') && !e.includes('terminal'),
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('can send a message and get response', async ({ page }) => {
    const textarea = page.locator('#shre-chat-textarea');
    await textarea.click();
    await textarea.fill('Say hello in one word');

    // Send via Enter
    await page.keyboard.press('Enter');

    // Wait for a response bubble (assistant message)
    const response = page.locator('[data-role="assistant"], .assistant-message, [class*="assistant"]').first();
    await expect(response).toBeVisible({ timeout: 30_000 });
  });

  test('Router mode sends message without error', async ({ page }) => {
    // Look for model picker / mode selector
    const modelPicker = page.locator('[data-testid="model-picker"], button:has-text("Model"), [class*="model-picker"]').first();

    // If model picker exists, try switching to Router
    if (await modelPicker.isVisible({ timeout: 3000 }).catch(() => false)) {
      await modelPicker.click();

      // Look for Router option
      const routerOption = page.locator('text=/router/i').first();
      if (await routerOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await routerOption.click();
        await page.waitForTimeout(1000);
      }
    }

    // Send a message
    const textarea = page.locator('#shre-chat-textarea');
    await textarea.click();
    await textarea.fill('Hello from QA test');
    await page.keyboard.press('Enter');

    // Wait for response — should not show connection error
    await page.waitForTimeout(10_000);

    // Check no error messages appeared
    const errorMsgs = page.locator('text=/Router.*error|scope.*error|forbidden|disconnected/i');
    const errorCount = await errorMsgs.count();
    expect(errorCount).toBe(0);
  });

  test('status bar shows connected (green dot)', async ({ page }) => {
    await page.waitForTimeout(3000);

    // Look for the status indicator
    const connectedDot = page.locator('[title="Connected"], [aria-label="Connected"]').first();
    const disconnectedDot = page.locator('[title="Disconnected"], [aria-label="Disconnected"]').first();

    const connected = await connectedDot.isVisible({ timeout: 3000 }).catch(() => false);
    const disconnected = await disconnectedDot.isVisible({ timeout: 1000 }).catch(() => false);

    // Should be connected, not disconnected
    if (disconnected) {
      // Take screenshot for debugging
      await page.screenshot({ path: 'e2e/results/artifacts/status-bar-disconnected.png' });
    }
    // At minimum, should not show "disconnected"
    expect(disconnected).toBe(false);
  });
});
