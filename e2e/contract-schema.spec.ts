import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const contract = JSON.parse(readFileSync(join(process.cwd(), 'contract.json'), 'utf8')) as {
  endpoints?: Record<string, { auth?: boolean }>;
};

function obj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

test.describe('Agent 15: Contract Schema — critical payload shape checks', () => {
  test('GET /api/health payload shape', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(obj(body)).toBe(true);
    expect('status' in body || 'ok' in body).toBe(true);
  });

  test('GET /api/version payload shape', async ({ request }) => {
    const res = await request.get('/api/version');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(obj(body)).toBe(true);
  });

  test('GET /api/auth/check matches auth contract semantics', async ({ request }) => {
    const c = contract.endpoints?.['GET /api/auth/check'];
    expect(c).toBeTruthy();
    const res = await request.get('/api/auth/check');
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(obj(body) && 'authenticated' in body).toBe(true);
    }
  });

  test('POST /api/auth/login shape (negative path)', async ({ request }) => {
    const c = contract.endpoints?.['POST /api/auth/login'];
    expect(c?.auth).toBe(false);
    const res = await request.post('/api/auth/login', {
      data: { username: 'invalid-user', password: 'invalid-pass' },
    });
    expect([400, 401, 403]).toContain(res.status());
    const body = await res.json().catch(() => ({}));
    expect(obj(body)).toBe(true);
  });
});

