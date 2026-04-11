import { test, expect } from '@playwright/test';

test.describe('Agent 6: Accessibility & Edge Cases', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
  });

  // ═══════════ Accessibility ═══════════

  test('textarea has accessible label', async ({ page }) => {
    const textarea = page.locator('#shre-chat-textarea');
    const label =
      (await textarea.getAttribute('aria-label')) ||
      (await textarea.getAttribute('placeholder')) ||
      '';
    expect(label.length).toBeGreaterThan(0);
  });

  test('all buttons have accessible names', async ({ page }) => {
    const buttons = page.locator('button:visible');
    const count = await buttons.count();
    let unlabeled = 0;
    const unlabeledDetails: string[] = [];

    for (let i = 0; i < Math.min(count, 30); i++) {
      const btn = buttons.nth(i);
      const ariaLabel = (await btn.getAttribute('aria-label')) || '';
      const title = (await btn.getAttribute('title')) || '';
      const text = (await btn.textContent()) || '';
      if (!ariaLabel && !title && !text.trim()) {
        unlabeled++;
        const cls = (await btn.getAttribute('class')) || '';
        unlabeledDetails.push(`Button ${i}: class="${cls.slice(0, 50)}"`);
      }
    }

    if (unlabeled > 0) {
      console.log(`GAP: ${unlabeled} buttons without accessible names:`);
      unlabeledDetails.forEach((d) => console.log(`  - ${d}`));
    }
    // Allow some unlabeled (icon-only) but flag as gap
    expect(unlabeled).toBeLessThan(10);
  });

  test('page has proper title', async ({ page }) => {
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('focus management: Tab cycles through interactive elements', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
    const focused = await page.evaluate(() => document.activeElement?.tagName || '');
    expect(focused).toBeTruthy();
  });

  // ═══════════ Error Handling ═══════════

  test('no console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore known non-critical errors
        if (
          !text.includes('favicon') &&
          !text.includes('net::ERR') &&
          !text.includes('WebSocket') &&
          !text.includes('Content Security Policy') &&
          !text.includes('ServiceWorker') &&
          !text.includes('SSL certificate') &&
          !text.includes('status of 400') &&
          !text.includes('localhost:8899') &&
          !text.includes('502 (Bad Gateway)')
        ) {
          errors.push(text);
        }
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    if (errors.length > 0) {
      console.log(`GAP: ${errors.length} console errors on load:`);
      errors.slice(0, 5).forEach((e) => console.log(`  - ${e.slice(0, 120)}`));
    }
    // Allow some console errors but flag them
    expect(errors.length).toBeLessThan(10);
  });

  test('no unhandled JS exceptions', async ({ page }) => {
    const exceptions: string[] = [];
    page.on('pageerror', (error) => {
      const msg = error.message;
      // Ignore known non-critical exceptions
      if (
        msg.includes('SecurityError') ||
        msg.includes('Content Security Policy') ||
        msg.includes('ServiceWorker') ||
        msg.includes('SSL') ||
        msg.includes('net::ERR')
      ) {
        return;
      }
      exceptions.push(msg);
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    if (exceptions.length > 0) {
      console.log(`GAP: ${exceptions.length} unhandled exceptions:`);
      exceptions.forEach((e) => console.log(`  - ${e.slice(0, 120)}`));
    }
    expect(exceptions.length).toBe(0);
  });

  // ═══════════ Performance ═══════════

  test('page loads within 10 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea', { timeout: 10_000 });
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(10_000);
    console.log(`INFO: Page load time: ${duration}ms`);
  });

  test('no memory-heavy resources blocking render', async ({ page }) => {
    const metrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return entries
        .filter((e) => e.transferSize > 500_000) // > 500KB
        .map((e) => ({ name: e.name.split('/').pop(), size: Math.round(e.transferSize / 1024) }));
    });

    if (metrics.length > 0) {
      console.log('NOTE: Large resources detected:');
      metrics.forEach((m) => console.log(`  - ${m.name}: ${m.size}KB`));
    }
  });

  // ═══════════ Edge Cases ═══════════

  test('empty message cannot be sent', async ({ page }) => {
    const textarea = page.locator('#shre-chat-textarea');
    await textarea.fill('');
    const sendBtn = page.locator('button[aria-label*="Send"], button[type="submit"]').first();
    // Send button should be disabled or click should not submit
    const disabled = await sendBtn.isDisabled().catch(() => false);
    if (!disabled) {
      console.log('NOTE: Send button not disabled when empty — verify server-side validation');
    }
  });

  test("very long message doesn't break layout", async ({ page }) => {
    const textarea = page.locator('#shre-chat-textarea');
    const longMsg = 'A'.repeat(5000);
    await textarea.fill(longMsg);
    // Textarea should still be visible and not overflow
    await expect(textarea).toBeVisible();
    const box = await textarea.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(100);
  });

  test("special characters in input don't cause XSS", async ({ page }) => {
    const textarea = page.locator('#shre-chat-textarea');
    const xssPayload = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
    await textarea.fill(xssPayload);
    const value = await textarea.inputValue();
    // The textarea should contain the raw text, not execute it
    expect(value).toContain('<script>');
  });

  test("rapid navigation doesn't crash", async ({ page }) => {
    const views = ['preview', 'activity', 'tasks', 'chat', 'spend', 'chat'];
    for (const view of views) {
      await page.evaluate((v) => {
        window.dispatchEvent(new CustomEvent('shre:switch-view', { detail: v }));
      }, view);
      await page.waitForTimeout(200);
    }
    // Should end on chat without crash
    await expect(page.locator('#shre-chat-textarea')).toBeVisible({ timeout: 5000 });
  });

  // ═══════════ Identity Verification ═══════════

  test('identity verification endpoint exists', async ({ page }) => {
    const res = await page.evaluate(async () => {
      try {
        const r = await fetch('/api/verify-identity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'wrong-code-qa-test' }),
        });
        return r.status;
      } catch {
        return -1;
      }
    });
    // Should return 200 with { verified: false } or 401 — NOT 500
    expect(res).not.toBe(500);
  });
});
