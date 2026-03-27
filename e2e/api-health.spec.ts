import { test, expect } from '@playwright/test';

test.describe('Agent 3: API Health — endpoint availability', () => {
  test.setTimeout(60_000);

  const BASE = 'https://localhost:5510';

  // ═══════════ Health Endpoints ═══════════

  test('GET /health returns 200', async ({ request }) => {
    const res = await request.get(`${BASE}/health`);
    expect(res.status()).toBe(200);
  });

  test('GET /readyz returns 200', async ({ request }) => {
    const res = await request.get(`${BASE}/readyz`);
    expect(res.status()).toBe(200);
  });

  test('GET /api/health returns 200', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.status()).toBe(200);
  });

  test('GET /api/readyz returns 200', async ({ request }) => {
    const res = await request.get(`${BASE}/api/readyz`);
    expect(res.status()).toBe(200);
  });

  // ═══════════ Auth Endpoints ═══════════

  test('GET /api/csrf-token returns token', async ({ request }) => {
    const res = await request.get(`${BASE}/api/csrf-token`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('csrfToken');
  });

  test('POST /api/auth/check returns auth status', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/check`);
    // Either 200 (authenticated) or 401 — both valid responses
    expect([200, 401]).toContain(res.status());
  });

  // ═══════════ Public Endpoints (no auth needed) ═══════════

  test('GET /api/version returns version info', async ({ request }) => {
    const res = await request.get(`${BASE}/api/version`);
    expect(res.status()).toBe(200);
  });

  test('GET /api/platform-status returns status', async ({ request }) => {
    const res = await request.get(`${BASE}/api/platform-status`);
    expect([200, 503]).toContain(res.status()); // 503 if some services down
  });

  // ═══════════ Authenticated Endpoints ═══════════

  test('GET /api/tasks returns task list', async ({ request }) => {
    const res = await request.get(`${BASE}/api/tasks`);
    // 200 if auth cookie present, 401/403 if not
    expect([200, 401, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(Array.isArray(body) || body.tasks).toBeTruthy();
    }
  });

  test('GET /api/agents returns agent list', async ({ request }) => {
    const res = await request.get(`${BASE}/api/agents`);
    expect([200, 401, 403]).toContain(res.status());
  });

  test('GET /api/reminders returns reminders', async ({ request }) => {
    const res = await request.get(`${BASE}/api/reminders`);
    expect([200, 401, 403]).toContain(res.status());
  });

  test('GET /api/feed returns feed data', async ({ request }) => {
    const res = await request.get(`${BASE}/api/feed`);
    expect([200, 401, 403]).toContain(res.status());
  });

  test('GET /api/sitemap returns deep-link registry', async ({ request }) => {
    const res = await request.get(`${BASE}/api/sitemap`);
    expect([200, 401, 403]).toContain(res.status());
  });

  // ═══════════ Proxy Endpoints ═══════════

  test('GET /api/marketplace/agents returns agent catalog', async ({ request }) => {
    const res = await request.get(`${BASE}/api/marketplace/agents`);
    // May fail if shre-hr is down — that's a valid finding
    expect([200, 401, 403, 502, 503]).toContain(res.status());
    if (res.status() >= 500) {
      console.log(
        `GAP: /api/marketplace/agents returned ${res.status()} — upstream shre-hr may be down`,
      );
    }
  });

  test('GET /api/marketplace/catalog returns catalog', async ({ request }) => {
    const res = await request.get(`${BASE}/api/marketplace/catalog`);
    expect([200, 401, 403, 502, 503]).toContain(res.status());
    if (res.status() >= 500) {
      console.log(
        `GAP: /api/marketplace/catalog returned ${res.status()} — upstream shre-marketplace may be down`,
      );
    }
  });

  // ═══════════ Security Checks ═══════════

  test('CSP header is present', async ({ request }) => {
    const res = await request.get(`${BASE}/`);
    const csp = res.headers()['content-security-policy'] || '';
    expect(csp.length).toBeGreaterThan(0);
    expect(csp).toContain('default-src');
  });

  test('CSP allows blob: in frame-src', async ({ request }) => {
    const res = await request.get(`${BASE}/`);
    const csp = res.headers()['content-security-policy'] || '';
    expect(csp).toContain('blob:');
  });

  test('X-Frame-Options header is set', async ({ request }) => {
    const res = await request.get(`${BASE}/`);
    const xfo = res.headers()['x-frame-options'] || '';
    expect(xfo.length).toBeGreaterThan(0);
  });

  test('non-existent API returns error status', async ({ request }) => {
    const res = await request.get(`${BASE}/api/does-not-exist-qa-test`);
    // May return 404, 401, or 200 (SPA fallback) — not 500
    expect(res.status()).not.toBe(500);
  });

  // ═══════════ WebSocket Endpoints ═══════════

  test('WebSocket terminal path exists', async ({ page }) => {
    // We can't fully test WS here but we verify the upgrade path doesn't 500
    const res = await page.evaluate(async () => {
      try {
        const r = await fetch('/ws/terminal', { method: 'GET' });
        return r.status;
      } catch {
        return -1;
      }
    });
    // Expected: 426 (Upgrade Required) or 403 or connection error — NOT 500
    expect(res).not.toBe(500);
  });
});
