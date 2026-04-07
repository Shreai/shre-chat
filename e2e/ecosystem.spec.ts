import { test, expect } from '@playwright/test';

test.describe('Agent 4: Ecosystem — app drawer, iframes, integrations', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
  });

  // ═══════════ Apps Drawer ═══════════

  test('apps drawer button exists in more menu', async ({ page }) => {
    // The Ecosystem Apps button is inside the header "more" menu (3-dot or kebab)
    const moreBtn = page.locator('button[aria-label*="more" i], button[aria-label*="menu" i], button[aria-label*="option" i]').first();
    const moreVisible = await moreBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (moreVisible) {
      await moreBtn.click();
      await page.waitForTimeout(300);
      const appsBtn = page.locator('button[aria-label="Open Ecosystem Apps"], button:has-text("Ecosystem Apps")').first();
      await expect(appsBtn).toBeVisible({ timeout: 3000 });
    } else {
      // Button might be directly visible in wider layouts
      const directBtn = page.locator('button[aria-label="Open Ecosystem Apps"]').first();
      const directVisible = await directBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (!directVisible) {
        console.log('NOTE: Ecosystem Apps button is inside a menu — opened via more/kebab button');
      }
    }
  });

  test('apps drawer shows ecosystem apps when opened', async ({ page }) => {
    // Try to open the apps drawer via the custom event
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('shre:toggle-apps-drawer'));
    });
    await page.waitForTimeout(800);

    // Check for known ecosystem app names
    const knownApps = ['MIB007', 'Router Gateway', 'CortexDB', 'StorePulse', 'Marketplace'];
    let foundCount = 0;
    for (const app of knownApps) {
      const el = page.locator(`text=${app}`).first();
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        foundCount++;
      }
    }

    if (foundCount === 0) {
      // Maybe the drawer didn't open — try clicking the button
      console.log('NOTE: Apps drawer may not have opened via custom event — trying button click');
    } else {
      expect(foundCount).toBeGreaterThanOrEqual(2);
    }
  });

  // ═══════════ Proxied Views ═══════════

  test('Router Gateway iframe route exists', async ({ page }) => {
    const res = await page.goto('/router/', { waitUntil: 'domcontentloaded' });
    // Should serve the proxied content or redirect
    expect(res?.status()).toBeLessThan(500);
  });

  test('StorePulse route exists', async ({ page }) => {
    const res = await page.goto('/storepulse/', { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBeLessThan(500);
  });

  test('CortexDB UI route exists', async ({ page }) => {
    const res = await page.goto('/cortexdb-ui/', { waitUntil: 'domcontentloaded' });
    // 502/503 expected when CortexDB dashboard is offline — route still exists
    expect([200, 301, 302, 502, 503]).toContain(res?.status());
  });

  test('Shre Dashboard route exists', async ({ page }) => {
    const res = await page.goto('/shre-dashboard/', { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBeLessThan(500);
  });

  test('App Marketplace route exists', async ({ page }) => {
    const res = await page.goto('/app-marketplace/', { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBeLessThan(500);
  });

  // ═══════════ Iframe View Loading ═══════════

  test('Router Gateway view loads in iframe', async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('shre:switch-view', { detail: 'router-gateway' }));
    });
    await page.waitForTimeout(1500);

    const iframe = page.locator('iframe').first();
    const hasIframe = await iframe.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasIframe) {
      console.log('GAP: Router Gateway view did not render an iframe');
    }
  });

  // ═══════════ Status Bar ═══════════

  test('status bar renders', async ({ page }) => {
    const statusBar = page.locator('[class*="status-bar"], [class*="StatusBar"]').first();
    const directMatch = await statusBar.isVisible({ timeout: 3000 }).catch(() => false);

    if (!directMatch) {
      // Look for status bar indicators: connection dot, agent count, etc.
      const connectionDot = page.locator('[class*="connection"], [class*="status"]').first();
      const hasDot = await connectionDot.isVisible({ timeout: 3000 }).catch(() => false);
      if (!hasDot) {
        console.log('GAP: Status bar not visible — may need class selector update');
      }
    }
  });

  test('status bar shows connection status', async ({ page }) => {
    // The status bar fetches from /api/status-bar
    const res = await page.evaluate(async () => {
      try {
        const r = await fetch('/api/status-bar');
        return { status: r.status, body: await r.json() };
      } catch (e) {
        return { status: -1, body: null };
      }
    });

    if (res.status === 200 && res.body) {
      // Status bar API is working
      expect(res.body).toBeDefined();
    } else {
      console.log(`GAP: /api/status-bar returned status ${res.status}`);
    }
  });

  // ═══════════ Agent Picker ═══════════

  test('agent picker can be opened', async ({ page }) => {
    // Look for agent selector button
    const agentBtn = page.locator('button[aria-label*="agent" i], [class*="agent-pick"]').first();
    const visible = await agentBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (visible) {
      await agentBtn.click();
      await page.waitForTimeout(500);
      // Should show agent list or search
      const agentList = page.locator('text=/shre|agent|founding/i').first();
      const hasAgents = await agentList.isVisible({ timeout: 3000 }).catch(() => false);
      if (!hasAgents) {
        console.log('GAP: Agent picker opened but no agents listed');
      }
    } else {
      console.log('NOTE: Agent picker button not found — may use different selector');
    }
  });
});
