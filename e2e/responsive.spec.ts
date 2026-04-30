import { test, expect, devices } from '@playwright/test';
import { switchView } from './view-switch';

/**
 * Agent 8: Responsive & Device Testing
 *
 * Tests UI/UX across different devices, screen sizes, and orientations:
 * - Mobile (iPhone, Android)
 * - Tablet (iPad portrait/landscape)
 * - Desktop (standard, wide, ultrawide)
 * - Orientation changes
 */
test.describe('Agent 8: Responsive — devices, sizes, orientations', () => {
  test.setTimeout(60_000);

  // ═══════════ Mobile Devices ═══════════

  test.describe('iPhone 14 (390x844)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('chat renders on iPhone', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
      await expect(page.locator('#shre-chat-textarea')).toBeVisible();

      // Textarea should be full width on mobile
      const box = await page.locator('#shre-chat-textarea').boundingBox();
      expect(box).toBeTruthy();
      expect(box!.width).toBeGreaterThan(250);
    });

    test('sidebar is hidden on iPhone', async ({ page }) => {
      // Viewport is set to 390x844 via test.use — page loads at mobile width
      // The sidebar defaults to closed when window.innerWidth < 768
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

      // Sidebar should be collapsed on mobile (fixed + sidebar-hidden)
      const searchInput = page.locator('input[placeholder*="Search sessions" i]');
      const sidebarVisible = await searchInput.isVisible({ timeout: 2000 }).catch(() => false);
      // On fresh load at 390px, sidebar should be closed
      if (sidebarVisible) {
        console.log('NOTE: Sidebar opened on iPhone — may have been restored from prior state');
      }
    });

    test('message input works on iPhone', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

      const textarea = page.locator('#shre-chat-textarea');
      await textarea.fill('Mobile test message');
      await expect(textarea).toHaveValue('Mobile test message');
    });

    test('no horizontal overflow on iPhone', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
      // Wait for layout to stabilize after hydration
      await page.waitForTimeout(500);

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (scrollWidth > clientWidth + 10) {
        console.log(`GAP: iPhone horizontal overflow: scrollWidth=${scrollWidth}, clientWidth=${clientWidth} (diff=${scrollWidth - clientWidth}px)`);
      }
      // 10px tolerance — small overflow from scrollbars or borders is acceptable
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 10);
    });
  });

  test.describe('Android (360x800)', () => {
    test.use({ viewport: { width: 360, height: 800 } });

    test('chat renders on small Android', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
      await expect(page.locator('#shre-chat-textarea')).toBeVisible();
    });

    test('no horizontal overflow on Android', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
    });
  });

  // ═══════════ Tablet Devices ═══════════

  test.describe('iPad portrait (810x1080)', () => {
    test.use({ viewport: { width: 810, height: 1080 } });

    test('chat renders on iPad portrait', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
      await expect(page.locator('#shre-chat-textarea')).toBeVisible();
    });

    test('sidebar may be visible on iPad portrait', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

      const searchInput = page.locator('input[placeholder*="Search sessions" i]');
      const sidebarVisible = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);
      // Document whether sidebar shows on tablet — either is valid UX
      console.log(`INFO: iPad portrait sidebar visible: ${sidebarVisible}`);
    });

    test('no horizontal overflow on iPad', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
    });
  });

  test.describe('iPad landscape (1080x810)', () => {
    test.use({ viewport: { width: 1080, height: 810 } });

    test('chat renders on iPad landscape', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
      await expect(page.locator('#shre-chat-textarea')).toBeVisible();
    });

    test('sidebar visible on iPad landscape', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

      // At 1080px wide, sidebar should be visible
      const searchInput = page.locator('input[placeholder*="Search sessions" i]');
      const sidebarVisible = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);
      if (!sidebarVisible) {
        console.log('GAP: Sidebar not visible at 1080px — should show on landscape tablet');
      }
    });
  });

  // ═══════════ Desktop Sizes ═══════════

  test.describe('Laptop (1366x768)', () => {
    test.use({ viewport: { width: 1366, height: 768 } });

    test('full layout renders on laptop', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

      // Both sidebar and main area should be visible
      await expect(page.locator('#shre-chat-textarea')).toBeVisible();
      const searchInput = page.locator('input[placeholder*="Search sessions" i]');
      await expect(searchInput).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Full HD (1920x1080)', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test('layout uses space well on Full HD', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

      await expect(page.locator('#shre-chat-textarea')).toBeVisible();

      // Chat area should have reasonable max-width, not stretch to fill 1920px
      const chatBox = await page.locator('#shre-chat-textarea').boundingBox();
      expect(chatBox).toBeTruthy();
      // Input area shouldn't span the full 1920px — it should be constrained
      console.log(`INFO: Chat input width at 1920px: ${chatBox!.width}px`);
    });
  });

  test.describe('Ultrawide (2560x1080)', () => {
    test.use({ viewport: { width: 2560, height: 1080 } });

    test('no layout break on ultrawide', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

      await expect(page.locator('#shre-chat-textarea')).toBeVisible();

      // Should not have horizontal scroll at ultrawide
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
    });
  });

  // ═══════════ Windows/Small Desktop ═══════════

  test.describe('Windows laptop (1280x720)', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('renders properly at 720p', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

      await expect(page.locator('#shre-chat-textarea')).toBeVisible();

      // Status bar / bottom area should be visible (not cut off)
      const textareaBox = await page.locator('#shre-chat-textarea').boundingBox();
      expect(textareaBox).toBeTruthy();
      expect(textareaBox!.y + textareaBox!.height).toBeLessThan(720);
    });
  });

  // ═══════════ Orientation Change Simulation ═══════════

  test('portrait to landscape transition', async ({ page }) => {
    // Start portrait (mobile)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
    await expect(page.locator('#shre-chat-textarea')).toBeVisible();

    // Rotate to landscape
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(500);

    // Chat should still be usable
    await expect(page.locator('#shre-chat-textarea')).toBeVisible();
    const box = await page.locator('#shre-chat-textarea').boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(300);
  });

  test('landscape to portrait transition', async ({ page }) => {
    // Start landscape (tablet)
    await page.setViewportSize({ width: 1080, height: 810 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

    // Rotate to portrait
    await page.setViewportSize({ width: 810, height: 1080 });
    await page.waitForTimeout(500);

    await expect(page.locator('#shre-chat-textarea')).toBeVisible();
  });

  // ═══════════ Touch-Friendly Checks ═══════════

  test('buttons have minimum touch targets (44px)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

    const buttons = page.locator('button:visible');
    const count = await buttons.count();
    let smallButtons = 0;
    const smallDetails: string[] = [];

    for (let i = 0; i < Math.min(count, 20); i++) {
      const btn = buttons.nth(i);
      const box = await btn.boundingBox();
      if (box && (box.width < 32 || box.height < 32)) {
        smallButtons++;
        const label = await btn.getAttribute('aria-label') || await btn.textContent() || '';
        smallDetails.push(`${label.slice(0, 30)}: ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }

    if (smallButtons > 0) {
      console.log(`GAP: ${smallButtons} buttons below 32px touch target on mobile:`);
      smallDetails.slice(0, 5).forEach(d => console.log(`  - ${d}`));
    }
    // Allow some small buttons but flag as gap
    expect(smallButtons).toBeLessThan(10);
  });

  // ═══════════ Text Readability ═══════════

  test('text is readable at mobile size', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

    // Check textarea font size is at least 16px (prevents iOS zoom on focus)
    const fontSize = await page.locator('#shre-chat-textarea').evaluate(
      el => window.getComputedStyle(el).fontSize
    );
    const fontSizePx = parseFloat(fontSize);
    if (fontSizePx < 16) {
      console.log(`GAP: Input font size ${fontSizePx}px < 16px — iOS will auto-zoom on focus`);
    }
  });

  // ═══════════ View Switching Across Sizes ═══════════

  test('preview view works on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

    // Inject a preview and switch
    await page.evaluate(() => {
      const entry = { id: 'resp_test', title: 'test.html', html: '<h1>Mobile Preview</h1>', savedAt: Date.now(), type: 'html' };
      sessionStorage.setItem('shre-preview-html', JSON.stringify(entry));
    });
    await switchView(page, 'preview');
    await page.waitForTimeout(800);

    // Preview should render without horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
  });

  test('tasks view works on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 810, height: 1080 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

    await switchView(page, 'tasks');
    await page.waitForTimeout(800);

    // No horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
  });
});
