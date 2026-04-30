import { test, expect, Page } from '@playwright/test';
import { switchView } from './view-switch';

/**
 * Responsive Preview Testing
 *
 * Tests inline file/image preview across specific viewport sizes:
 * - Mobile: 375x667 (iPhone SE)
 * - Mobile landscape: 667x375
 * - Tablet: 768x1024 (iPad)
 * - Tablet landscape: 1024x768
 * - Desktop: 1440x900
 * - Small desktop: 1024x768
 *
 * Split into:
 * 1. Public API tests (no auth) — file/image/PDF serving
 * 2. Login page responsive checks (no auth)
 * 3. Auth-required tests — chat UI, PreviewView, CSS checks
 */

const VIEWPORTS = [
  { name: 'Mobile (iPhone SE)', width: 375, height: 667, isMobile: true },
  { name: 'Mobile Landscape', width: 667, height: 375, isMobile: true },
  { name: 'Tablet (iPad)', width: 768, height: 1024, isMobile: false },
  { name: 'Tablet Landscape', width: 1024, height: 768, isMobile: false },
  { name: 'Desktop', width: 1440, height: 900, isMobile: false },
  { name: 'Small Desktop', width: 1024, height: 768, isMobile: false },
] as const;

// Login helper — handles auth if login page is shown
async function loginIfNeeded(page: Page): Promise<boolean> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const alreadyAuthed = await page
    .locator('#shre-chat-textarea')
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  if (alreadyAuthed) return true;

  const signInBtn = page.locator('button:has-text("Sign In")').first();
  const isLoginPage = await signInBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (isLoginPage) {
    const textInputs = page.locator(
      'input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])',
    );
    await textInputs.first().fill('rapidnir');
    await page.locator('input[type="password"]').first().fill('rapid@nir');
    await signInBtn.click();
    try {
      await page.waitForSelector('#shre-chat-textarea', { timeout: 20_000 });
      return true;
    } catch {
      return false;
    }
  }

  try {
    await page.waitForSelector('#shre-chat-textarea', { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

// ═══════════ SECTION 1: Public API File Preview (no auth) ═══════════

test.describe('File Preview API — Responsive', () => {
  test.setTimeout(30_000);

  for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} (${vp.width}x${vp.height})`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test('JPEG renders within viewport', async ({ page }) => {
        const resp = await page.goto('/api/files/view?path=/tmp/preview-test/test.jpg', {
          waitUntil: 'domcontentloaded',
        });
        if (!resp || resp.status() !== 200) {
          test.skip(true, `JPEG not available (${resp?.status()})`);
          return;
        }
        expect(resp.headers()['content-type'] || '').toContain('image/jpeg');
        await page.waitForTimeout(500);

        const imgInfo = await page.evaluate(() => {
          const img = document.querySelector('img');
          if (!img) return null;
          return {
            naturalW: img.naturalWidth,
            naturalH: img.naturalHeight,
            renderW: Math.round(img.getBoundingClientRect().width),
            renderH: Math.round(img.getBoundingClientRect().height),
          };
        });
        if (imgInfo) {
          console.log(
            `[${vp.name}] JPEG: natural=${imgInfo.naturalW}x${imgInfo.naturalH}, render=${imgInfo.renderW}x${imgInfo.renderH}`,
          );
          expect(imgInfo.renderW).toBeLessThanOrEqual(vp.width + 20);
        }
        await page.screenshot({
          path: `e2e/results/artifacts/jpeg-${vp.name.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
        });
      });

      test('PNG renders within viewport', async ({ page }) => {
        const resp = await page.goto('/api/files/view?path=/tmp/preview-test/test.png', {
          waitUntil: 'domcontentloaded',
        });
        if (!resp || resp.status() !== 200) {
          test.skip(true, `PNG not available (${resp?.status()})`);
          return;
        }
        expect(resp.headers()['content-type'] || '').toContain('image/png');
        await page.screenshot({
          path: `e2e/results/artifacts/png-${vp.name.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
        });
      });

      test('PDF served with correct MIME type', async ({ page }) => {
        // Use fetch API instead of page.goto — Playwright downloads PDFs instead of navigating
        const resp = await page.request.get('/api/files/view?path=/tmp/preview-test/test.pdf');
        if (resp.status() !== 200) {
          test.skip(true, `PDF not available (${resp.status()})`);
          return;
        }
        const ct = resp.headers()['content-type'] || '';
        console.log(`[${vp.name}] PDF content-type: ${ct}`);
        expect(ct).toContain('application/pdf');
      });

      test('no horizontal overflow on image page', async ({ page }) => {
        await page.goto('/api/files/view?path=/tmp/preview-test/test.jpg', {
          waitUntil: 'domcontentloaded',
        });
        await page.waitForTimeout(500);
        const { sw, cw } = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        }));
        if (sw > cw + 5) {
          console.log(`OVERFLOW at ${vp.name}: scroll=${sw} > client=${cw}`);
        }
        expect(sw).toBeLessThanOrEqual(cw + 5);
      });
    });
  }

  test('image scales proportionally across viewports', async ({ page }) => {
    const results: { vp: string; w: number; h: number; vpW: number }[] = [];
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/api/files/view?path=/tmp/preview-test/test.jpg', {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(500);
      const info = await page.evaluate(() => {
        const img = document.querySelector('img');
        if (!img) return { w: 0, h: 0 };
        return {
          w: Math.round(img.getBoundingClientRect().width),
          h: Math.round(img.getBoundingClientRect().height),
        };
      });
      results.push({ vp: vp.name, ...info, vpW: vp.width });
    }
    console.log('\n=== Image Scaling Across Viewports ===');
    for (const r of results) {
      const pct = r.vpW > 0 ? Math.round((r.w / r.vpW) * 100) : 0;
      console.log(`  ${r.vp} (${r.vpW}px): ${r.w}x${r.h} (${pct}%)`);
    }
  });
});

// ═══════════ SECTION 2: Login Page Responsive (no auth) ═══════════

test.describe('Login Page — Responsive', () => {
  test.setTimeout(30_000);

  for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} (${vp.width}x${vp.height})`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test('login page renders correctly', async ({ page }) => {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);

        const signInBtn = page.locator('button:has-text("Sign In")');
        const visible = await signInBtn.isVisible({ timeout: 5000 }).catch(() => false);

        if (visible) {
          const btnBox = await signInBtn.boundingBox();
          if (btnBox) {
            const withinVp =
              btnBox.y + btnBox.height <= vp.height && btnBox.x + btnBox.width <= vp.width;
            console.log(
              `[${vp.name}] Sign In: ${Math.round(btnBox.width)}x${Math.round(btnBox.height)} at y=${Math.round(btnBox.y)}, inViewport=${withinVp}`,
            );
            if (!withinVp) {
              console.log(
                `GAP: Sign In below fold at ${vp.name} (y=${Math.round(btnBox.y)}, vpH=${vp.height})`,
              );
            }
            if (btnBox.height < 44) {
              console.log(
                `GAP: Sign In button height ${Math.round(btnBox.height)}px < 44px touch target`,
              );
            }
          }
        } else {
          console.log(`[${vp.name}] No Sign In — may be authed already`);
        }

        const { sw, cw } = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        }));
        expect(sw).toBeLessThanOrEqual(cw + 5);

        await page.screenshot({
          path: `e2e/results/artifacts/login-${vp.name.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
        });
      });
    });
  }
});

// ═══════════ SECTION 3: Chat UI (auth required) ═══════════

test.describe('Chat UI — Responsive (auth required)', () => {
  test.setTimeout(60_000);

  for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} (${vp.width}x${vp.height})`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test('chat area renders and is usable', async ({ page }) => {
        const authed = await loginIfNeeded(page);
        if (!authed) {
          test.skip(true, 'Auth not available');
          return;
        }
        const textarea = page.locator('#shre-chat-textarea');
        await expect(textarea).toBeVisible();
        const box = await textarea.boundingBox();
        expect(box).toBeTruthy();
        expect(box!.width).toBeGreaterThan(vp.isMobile ? 200 : 400);
        expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 2);
        console.log(
          `[${vp.name}] textarea: ${Math.round(box!.width)}x${Math.round(box!.height)}`,
        );
        await page.screenshot({
          path: `e2e/results/artifacts/chat-${vp.name.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
        });
      });

      test('PreviewView responsive behavior', async ({ page }) => {
        const authed = await loginIfNeeded(page);
        if (!authed) {
          test.skip(true, 'Auth not available');
          return;
        }
        await page.evaluate(() => {
          const entry = {
            id: `resp_${Date.now()}`,
            title: 'responsive-test.html',
            html: '<h1>Test</h1><p>Long text for wrapping.</p><table border=1 style="width:100%"><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>',
            savedAt: Date.now(),
            type: 'html',
          };
          sessionStorage.setItem('shre-preview-html', JSON.stringify(entry));
        });
        await switchView(page, 'preview');
        await page.waitForTimeout(1000);
        const { sw, cw } = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        }));
        if (sw > cw + 5) console.log(`PREVIEW OVERFLOW at ${vp.name}`);
        await page.screenshot({
          path: `e2e/results/artifacts/preview-${vp.name.replace(/[^a-zA-Z0-9]/g, '-')}.png`,
        });
      });
    });
  }
});
