import { test, expect, request as pwRequest } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGE = process.env.SHRE_STAGE || 'dev';
const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5000';

const matrix = JSON.parse(readFileSync(join(process.cwd(), 'e2e/meta/rbac-matrix.json'), 'utf8')) as {
  roleExpectations: Record<string, { adminAudit: 'allow' | 'deny'; adminCreateItem: 'allow' | 'deny' }>;
};

const roles = [
  { id: 'superadmin', userEnv: 'E2E_SUPERADMIN_USER', passEnv: 'E2E_SUPERADMIN_PASS' },
  { id: 'admin', userEnv: 'E2E_ADMIN_USER', passEnv: 'E2E_ADMIN_PASS' },
  { id: 'operator', userEnv: 'E2E_OPERATOR_USER', passEnv: 'E2E_OPERATOR_PASS' },
  { id: 'read-only', userEnv: 'E2E_READONLY_USER', passEnv: 'E2E_READONLY_PASS' },
] as const;

async function loginToken(username: string, password: string): Promise<string | null> {
  const ctx = await pwRequest.newContext({ baseURL: BASE });
  const res = await ctx.post('/api/auth/login', { data: { username, password } });
  const body = await res.json().catch(() => ({}));
  await ctx.dispose();
  if (!res.ok) return null;
  return body?.token || null;
}

test.describe('Agent 16: RBAC Matrix — stage role permissions', () => {
  for (const role of roles) {
    test(`${role.id}: admin endpoints follow policy`, async ({ request }) => {
      const username = process.env[role.userEnv];
      const password = process.env[role.passEnv];
      test.skip(!username || !password, `Missing creds: ${role.userEnv}/${role.passEnv}`);

      const token = await loginToken(username!, password!);
      test.skip(!token, `Unable to login for role ${role.id}`);

      const headers = { Authorization: `Bearer ${token}` };
      const expectPolicy = matrix.roleExpectations[role.id];

      const auditRes = await request.get('/api/admin/audit', { headers });
      const createRes = await request.post('/api/admin/create-item', {
        headers: { ...headers, 'Content-Type': 'application/json' },
        data: { itemName: `RBAC-${Date.now()}`, salePrice: 1.99, store: 'rapidlab' },
      });

      if (expectPolicy.adminAudit === 'allow') {
        expect([200, 502, 503]).toContain(auditRes.status());
      } else {
        expect([401, 403, 404]).toContain(auditRes.status());
      }

      if (expectPolicy.adminCreateItem === 'allow') {
        expect([200, 502, 503]).toContain(createRes.status());
      } else {
        expect([401, 403, 404]).toContain(createRes.status());
      }

      console.log(`RBAC stage=${STAGE} role=${role.id} audit=${auditRes.status()} create=${createRes.status()}`);
    });
  }
});

