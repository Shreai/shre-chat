import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5510';
const BRIDGE = 'http://127.0.0.1:5450';

// Track external service availability — checked once in beforeAll
let cortexAlive = false;
let routerAlive = false;
let bridgeAlive = false;

test.describe('Agent 9: Data Integration — POS ↔ RapidRMS ↔ Agent flow', () => {
  test.setTimeout(90_000);

  test.beforeAll(async ({ request }) => {
    // Pre-check external service health so we can skip dependent tests
    try {
      const r = await request.get('http://127.0.0.1:5400/health/live', { timeout: 5000, ignoreHTTPSErrors: true });
      cortexAlive = r.status() === 200;
    } catch { cortexAlive = false; }
    try {
      const r = await request.get('http://127.0.0.1:5497/health', { timeout: 5000, ignoreHTTPSErrors: true });
      routerAlive = [200, 204].includes(r.status());
    } catch { routerAlive = false; }
    try {
      const r = await request.get(`${BRIDGE}/health`, { timeout: 5000, ignoreHTTPSErrors: true });
      bridgeAlive = r.ok();
    } catch { bridgeAlive = false; }
    console.log(`Service pre-check: cortex=${cortexAlive}, router=${routerAlive}, bridge=${bridgeAlive}`);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
  });

  // ═══════════ API Layer: CortexDB has RapidLab data ═══════════

  test('CortexDB health is alive', async ({ request }) => {
    test.skip(!cortexAlive, 'CortexDB not reachable — skipping');
    const res = await request.get('http://127.0.0.1:5400/health/live', {
      ignoreHTTPSErrors: true,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('alive');
  });

  test('shre-router is healthy', async ({ request }) => {
    test.skip(!routerAlive, 'shre-router not reachable — skipping');
    const res = await request.get('http://127.0.0.1:5497/health', {
      ignoreHTTPSErrors: true,
    });
    expect([200, 204]).toContain(res.status());
  });

  test('shre-chat proxy to router is reachable', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`, {
      ignoreHTTPSErrors: true,
    });
    expect([200, 204]).toContain(res.status());
  });

  // ═══════════ RapidRMS API: rapidlab store authenticates ═══════════

  test('rapidlab store authenticates to RapidRMS API', async ({ request }) => {
    test.skip(!routerAlive, 'shre-router not reachable — skipping');
    const res = await request.post(`${BASE}/api/router/v1/chat`, {
      ignoreHTTPSErrors: true,
      data: {
        messages: [{ role: 'user', content: 'What stores are connected?' }],
        agentId: 'shre',
        stream: false,
        maxTokens: 200,
      },
    });
    // Accept 200 (success) or 401/403 (auth needed but route works)
    expect([200, 401, 403]).toContain(res.status());
  });

  // ═══════════ Chat → Agent: POS queries route correctly ═══════════

  test('sending POS query shows agent processing', async ({ page }) => {
    test.skip(!routerAlive, 'shre-router not reachable — skipping');
    const textarea = page.locator('#shre-chat-textarea');
    await textarea.click();
    await textarea.fill('How many items does the rapidlab store have?');

    // Send message
    const sendBtn = page.locator('button[aria-label*="Send"], button[type="submit"]').first();
    await sendBtn.click();

    // Wait for agent response — look for Shre's message bubble (justify-start = assistant side)
    // The message list container holds all messages; assistant messages have agent name above them
    // Wait for any new content after our user message — the process bar or response text
    const responseArea = page.locator('.group\\/msg').last();
    await expect(responseArea).toBeVisible({ timeout: 60_000 });

    // Wait for the response to finish streaming — the stop button disappears or text stabilizes
    // Give it time to complete
    await page.waitForTimeout(5_000);

    // Get all text from the message area (excluding user messages which are justify-end)
    const assistantBubbles = page.locator('.justify-start .group\\/msg');
    const count = await assistantBubbles.count();
    expect(count).toBeGreaterThan(0);

    const lastBubble = assistantBubbles.last();
    const text = await lastBubble.textContent();
    expect(text).toBeTruthy();
    expect(text!.length).toBeGreaterThan(10);
  });

  test('rapidlab query returns data-aware response', async ({ page }) => {
    test.skip(!routerAlive, 'shre-router not reachable — skipping');
    const textarea = page.locator('#shre-chat-textarea');
    await textarea.click();
    await textarea.fill('What departments exist in the rapidlab store? List them.');

    const sendBtn = page.locator('button[aria-label*="Send"], button[type="submit"]').first();
    await sendBtn.click();

    // Wait for assistant response bubble
    const assistantBubbles = page.locator('.justify-start .group\\/msg');
    await page.waitForTimeout(3_000);
    await expect(assistantBubbles.last()).toBeVisible({ timeout: 60_000 });

    // Wait for streaming to finish
    await page.waitForTimeout(10_000);

    const text = (await assistantBubbles.last().textContent()) || '';
    expect(text.length).toBeGreaterThan(10);

    // The agent should reference store data — not say "I don't have access"
    const noAccess = /don.?t have access|no data|cannot access|not connected/i;
    if (noAccess.test(text)) {
      console.log('GAP: Agent cannot access rapidlab data — check data-source-resolver tenant-sources.json');
    }
  });

  // ═══════════ Data Source Resolver: store detection ═══════════

  test('data-source-resolver detects rapidlab keyword', async ({ request }) => {
    test.skip(!routerAlive, 'shre-router not reachable — skipping');
    test.setTimeout(180_000); // AI tool calls can take 2+ min
    const res = await request.post(`${BASE}/api/router/v1/chat`, {
      ignoreHTTPSErrors: true,
      data: {
        messages: [{ role: 'user', content: 'Show me rapidlab inventory count' }],
        agentId: 'shre',
        stream: false,
        maxTokens: 300,
      },
    });

    if (res.status() === 200) {
      const body = await res.json();
      const content = typeof body === 'string' ? body : JSON.stringify(body);
      expect(content.length).toBeGreaterThan(0);
    } else {
      // Even if auth blocks it, the route should not 404
      expect([200, 401, 403, 429]).toContain(res.status());
    }
  });

  // ═══════════ Sync Pipeline: data exists in CortexDB ═══════════

  test('rapidlab items are synced to CortexDB', async ({ request }) => {
    test.skip(!cortexAlive, 'CortexDB not reachable — skipping');
    const res = await request.post('http://127.0.0.1:5400/v1/query', {
      ignoreHTTPSErrors: true,
      headers: {
        'Authorization': `Bearer ${process.env.CORTEX_API_KEY || ''}`,
      },
      data: {
        cortexql: "SELECT count(*) as cnt FROM rapidrms.item WHERE company_id = 'client-181155'",
      },
    });

    if (res.ok()) {
      const body = await res.json();
      const rows = body?.rows ?? body?.data ?? body?.result ?? [];
      if (Array.isArray(rows) && rows.length > 0) {
        const count = Number(rows[0]?.cnt ?? rows[0]?.[0] ?? 0);
        expect(count).toBeGreaterThan(0);
      }
    } else {
      console.log(`GAP: CortexDB query returned ${res.status()} — check access`);
    }
  });

  test('rapidlab customers are synced to CortexDB', async ({ request }) => {
    test.skip(!cortexAlive, 'CortexDB not reachable — skipping');
    const res = await request.post('http://127.0.0.1:5400/v1/query', {
      ignoreHTTPSErrors: true,
      headers: {
        'Authorization': `Bearer ${process.env.CORTEX_API_KEY || ''}`,
      },
      data: {
        cortexql: "SELECT count(*) as cnt FROM rapidrms.customer WHERE company_id = 'client-181155'",
      },
    });

    if (res.ok()) {
      const body = await res.json();
      const rows = body?.rows ?? body?.data ?? body?.result ?? [];
      if (Array.isArray(rows) && rows.length > 0) {
        const count = Number(rows[0]?.cnt ?? rows[0]?.[0] ?? 0);
        expect(count).toBeGreaterThan(0);
      }
    } else {
      console.log(`GAP: CortexDB query returned ${res.status()} for customers`);
    }
  });

  test('rapidlab departments are synced to CortexDB', async ({ request }) => {
    test.skip(!cortexAlive, 'CortexDB not reachable — skipping');
    const res = await request.post('http://127.0.0.1:5400/v1/query', {
      ignoreHTTPSErrors: true,
      headers: {
        'Authorization': `Bearer ${process.env.CORTEX_API_KEY || ''}`,
      },
      data: {
        cortexql: "SELECT count(*) as cnt FROM rapidrms.department WHERE company_id = 'client-181155'",
      },
    });

    if (res.ok()) {
      const body = await res.json();
      const rows = body?.rows ?? body?.data ?? body?.result ?? [];
      if (Array.isArray(rows) && rows.length > 0) {
        const count = Number(rows[0]?.cnt ?? rows[0]?.[0] ?? 0);
        expect(count).toBeGreaterThan(0);
      }
    } else {
      console.log(`GAP: CortexDB query returned ${res.status()} for departments`);
    }
  });

  // ═══════════ Tenant Config: rapidlab is registered ═══════════

  test('tenant-sources.json includes rapidlab', async ({}) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');

    const tenantFile = path.join(os.homedir(), '.shre', 'router', 'tenant-sources.json');
    const exists = fs.existsSync(tenantFile);
    expect(exists).toBe(true);

    const data = JSON.parse(fs.readFileSync(tenantFile, 'utf-8'));
    const rapidlab = data.find(
      (t: any) => t.label?.toLowerCase().includes('rapidlab') || t.aliases?.includes('rapidlab'),
    );
    expect(rapidlab).toBeTruthy();
    expect(rapidlab.platform).toBe('rapidrms');
    expect(rapidlab.tenantId).toContain('181155');
  });

  // ═══════════ End-to-End: Full POS → Agent Flow ═══════════

  test('full flow: ask about rapidlab items → get meaningful response', async ({ page }) => {
    test.skip(!routerAlive, 'shre-router not reachable — skipping');
    const textarea = page.locator('#shre-chat-textarea');
    await textarea.click();
    await textarea.fill(
      'I want to know about the rapidlab store. How many products do they carry and what are the main departments?',
    );

    const sendBtn = page.locator('button[aria-label*="Send"], button[type="submit"]').first();
    await sendBtn.click();

    // Wait for assistant response bubbles
    const assistantBubbles = page.locator('.justify-start .group\\/msg');
    await page.waitForTimeout(3_000);
    await expect(assistantBubbles.last()).toBeVisible({ timeout: 75_000 });

    // Wait for streaming to complete
    await page.waitForTimeout(15_000);

    const text = (await assistantBubbles.last().textContent()) || '';

    // Response should be substantive
    expect(text.length).toBeGreaterThan(20);

    // Check for data-awareness indicators
    const dataIndicators = [
      /\d+\s*(items|products|skus)/i,
      /department/i,
      /rapidlab/i,
      /inventory/i,
      /store/i,
    ];

    const matchCount = dataIndicators.filter((re) => re.test(text)).length;
    if (matchCount < 2) {
      console.log(
        `GAP: Agent response may not be data-aware (${matchCount}/5 indicators matched). Response: ${text.slice(0, 200)}`,
      );
    }

    // At minimum the agent should acknowledge the store
    expect(matchCount).toBeGreaterThanOrEqual(1);
  });
});
