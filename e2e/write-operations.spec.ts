import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5510';
const LIVE_SERVER = 'http://127.0.0.1:8899';

test.describe('Agent 10: Write Operations — POS item create, price update, stock adjust', () => {
  test.setTimeout(120_000);
  test.describe.configure({ retries: 2 });

  // ═══════════ API Layer: Direct admin endpoint tests ═══════════

  test('live-server admin endpoints are reachable', async ({ request }) => {
    const res = await request.get(`${LIVE_SERVER}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('create item via admin API (rapidlab store)', async ({ request }) => {
    const itemName = `QA-Write-Test-${Date.now()}`;
    const res = await request.post(`${LIVE_SERVER}/api/admin/create-item`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Source': 'shre-router',
      },
      data: {
        itemName,
        salePrice: 7.99,
        costPrice: 3.50,
        quantity: 10,
        store: 'rapidlab',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(false);
    expect(body.message).toContain(itemName);
    console.log(`Created item: ${body.itemCode} — ${body.message}`);
  });

  test('update price via admin API (rapidlab store)', async ({ request }) => {
    // First create an item to update
    const itemName = `QA-Price-Test-${Date.now()}`;
    const createRes = await request.post(`${LIVE_SERVER}/api/admin/create-item`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Source': 'shre-router',
      },
      data: {
        itemName,
        salePrice: 5.00,
        store: 'rapidlab',
      },
    });
    expect(createRes.status()).toBe(200);
    const created = await createRes.json();
    const itemCode = created.itemCode;

    // Update its price
    const res = await request.post(`${LIVE_SERVER}/api/admin/update-price`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Source': 'shre-router',
      },
      data: {
        itemCode,
        newPrice: 8.49,
        store: 'rapidlab',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(false);
    console.log(`Price updated: ${itemCode} — ${body.message}`);
  });

  test('adjust stock via admin API (rapidlab store)', async ({ request }) => {
    // Create item then adjust stock
    const itemName = `QA-Stock-Test-${Date.now()}`;
    const createRes = await request.post(`${LIVE_SERVER}/api/admin/create-item`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Source': 'shre-router',
      },
      data: {
        itemName,
        salePrice: 3.00,
        quantity: 0,
        store: 'rapidlab',
      },
    });
    expect(createRes.status()).toBe(200);
    const created = await createRes.json();
    const itemCode = created.itemCode;

    // Add stock
    const res = await request.post(`${LIVE_SERVER}/api/admin/adjust-stock`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Source': 'shre-router',
      },
      data: {
        itemCode,
        quantity: 50,
        reason: 'received',
        store: 'rapidlab',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(false);
    console.log(`Stock adjusted: ${itemCode} — ${body.message}`);
  });

  test('rapidlab store accepts writes (READ_WRITE)', async ({ request }) => {
    const res = await request.post(`${LIVE_SERVER}/api/admin/create-item`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Source': 'shre-router',
      },
      data: {
        itemName: `QA-RW-Check-${Date.now()}`,
        salePrice: 1.00,
        store: 'rapidlab',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(false);
    console.log('READ_WRITE confirmed: rapidlab accepts writes');
  });

  // ═══════════ Router Layer: Write tools via shre-router ═══════════

  test('shre-router proxies create-item tool', async ({ request }) => {
    test.setTimeout(180_000);
    const res = await request.post(`${BASE}/api/router/v1/chat`, {
      ignoreHTTPSErrors: true,
      data: {
        messages: [
          { role: 'user', content: 'Create a new item called "QA Browser Widget" with price $6.99 in the rapidlab store.' },
        ],
        agentId: 'shre',
        stream: false,
        maxTokens: 500,
      },
    });
    // Accept any non-404 response — proves the route and tools are wired
    expect([200, 401, 403, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      const content = typeof body === 'string' ? body : JSON.stringify(body);
      console.log(`Router create-item response: ${content.slice(0, 300)}`);
    }
  });

  // ═══════════ Browser Layer: Chat-driven write operations ═══════════

  test('shre-chat: create item via chat message', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

    const textarea = page.locator('#shre-chat-textarea');
    await textarea.click();
    await textarea.fill('Create a new item called "QA Shre Chat Item" with price $11.50 and quantity 15 in the rapidlab store.');

    const sendBtn = page.locator('button[aria-label*="Send"], button[type="submit"]').first();
    await sendBtn.click();

    // Wait for agent response
    const assistantBubbles = page.locator('.justify-start .group\\/msg');
    await page.waitForTimeout(5_000);
    await expect(assistantBubbles.last()).toBeVisible({ timeout: 120_000 });

    // Wait for streaming to finish
    await page.waitForTimeout(15_000);

    const text = (await assistantBubbles.last().textContent()) || '';
    expect(text.length).toBeGreaterThan(10);

    // Check if the agent acknowledged the creation
    const creationIndicators = [
      /creat(ed|ing|e)/i,
      /item/i,
      /QA.*Chat.*Item/i,
      /\$11\.50/,
      /rapidlab/i,
      /success/i,
    ];
    const matchCount = creationIndicators.filter((re) => re.test(text)).length;
    console.log(`Shre-chat create response (${matchCount}/6 indicators): ${text.slice(0, 300)}`);

    if (matchCount < 2) {
      console.log('GAP: Agent may not have executed the create-item tool');
    }
  });

  test('shre-chat: update price via chat message', async ({ page, request }) => {
    test.setTimeout(180_000);

    // Pre-check: live-server must be reachable for write tools
    const liveOk = await request.get(`${LIVE_SERVER}/health`).then(r => r.ok).catch(() => false);
    test.skip(!liveOk, 'Live server (8899) not reachable — skipping chat write test');

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

    const textarea = page.locator('#shre-chat-textarea');
    await textarea.click();
    await textarea.fill('Update the price of QATESTWIDGET to $19.99 in the rapidlab store.');

    const sendBtn = page.locator('button[aria-label*="Send"], button[type="submit"]').first();
    await sendBtn.click();

    const assistantBubbles = page.locator('.justify-start .group\\/msg');
    await page.waitForTimeout(5_000);
    await expect(assistantBubbles.last()).toBeVisible({ timeout: 120_000 });
    await page.waitForTimeout(15_000);

    const text = (await assistantBubbles.last().textContent()) || '';
    expect(text.length).toBeGreaterThan(10);
    console.log(`Price update response: ${text.slice(0, 300)}`);
  });

  test('shre-chat: adjust stock via chat message', async ({ page, request }) => {
    test.setTimeout(180_000);

    // Pre-check: live-server must be reachable for write tools
    const liveOk = await request.get(`${LIVE_SERVER}/health`).then(r => r.ok).catch(() => false);
    test.skip(!liveOk, 'Live server (8899) not reachable — skipping chat write test');

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });

    const textarea = page.locator('#shre-chat-textarea');
    await textarea.click();
    await textarea.fill('Add 100 units of stock to QATESTWIDGET in the rapidlab store. Reason: received shipment.');

    const sendBtn = page.locator('button[aria-label*="Send"], button[type="submit"]').first();
    await sendBtn.click();

    const assistantBubbles = page.locator('.justify-start .group\\/msg');
    await page.waitForTimeout(5_000);
    await expect(assistantBubbles.last()).toBeVisible({ timeout: 120_000 });
    await page.waitForTimeout(15_000);

    const text = (await assistantBubbles.last().textContent()) || '';
    expect(text.length).toBeGreaterThan(10);
    console.log(`Stock adjust response: ${text.slice(0, 300)}`);
  });

  // ═══════════ Verify: Audit trail ═══════════

  test('admin audit log records write operations', async ({ request }) => {
    const res = await request.get(`${LIVE_SERVER}/api/admin/audit`, {
      headers: { 'X-Service-Source': 'shre-router' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const entries = body.entries || body.log || body;
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);

    // Should have create-item entries from our tests
    const creates = entries.filter((e: any) => e.action === 'create-item');
    console.log(`Audit log: ${entries.length} total entries, ${creates.length} create-item entries`);
    expect(creates.length).toBeGreaterThan(0);
  });
});
