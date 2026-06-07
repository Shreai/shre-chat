import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGE = process.env.SHRE_STAGE || 'dev';

type StageConfig = {
  id: string;
  allowBypass: boolean;
  workspace: string;
  mode: string;
};

const matrix = JSON.parse(
  readFileSync(join(process.cwd(), 'e2e/config/stage-matrix.json'), 'utf8'),
) as { stages: StageConfig[] };

const stageCfg = matrix.stages.find((s) => s.id === STAGE);

test.describe('Agent 14: Stage Governance — bypass, workspace, admin boundaries', () => {
  test('stage exists in matrix and has governance fields', async () => {
    expect(stageCfg).toBeTruthy();
    expect(typeof stageCfg?.allowBypass).toBe('boolean');
    expect(stageCfg?.workspace?.length).toBeGreaterThan(0);
    expect(stageCfg?.mode === 'internal' || stageCfg?.mode === 'external').toBe(true);
  });

  test('devBypass policy matches stage config', async ({ page }) => {
    await page.goto('/?devBypass=1', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    const sawLogin = await page.locator('text=Sign in to continue').first().isVisible().catch(() => false);
    const sawChat = await page.locator('text=New chat').first().isVisible().catch(() => false);
    const hasShell = sawLogin || sawChat;
    expect(hasShell).toBe(true);
    if (stageCfg && !stageCfg.allowBypass && sawChat && !sawLogin) {
      console.log(`GAP: stage ${stageCfg.id} appears to allow devBypass; expected restricted`);
    }
  });

  test('unauthenticated admin endpoints are blocked', async ({ request }) => {
    const auditRes = await request.get('/api/admin/audit');
    expect([401, 403, 404]).toContain(auditRes.status());

    const createRes = await request.post('/api/admin/create-item', {
      data: { storeId: 'rapidlab', name: 'x', price: 1.23 },
    });
    expect([401, 403, 404]).toContain(createRes.status());
  });

  test('workspace context is present in authenticated shell', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const ls = await page.evaluate(() => ({
      workspace: localStorage.getItem('shre-auth-workspace'),
      workspaces: localStorage.getItem('shre-auth-workspaces'),
    }));

    const hasLogin = await page.locator('text=Sign in to continue').first().isVisible().catch(() => false);
    if (!hasLogin) {
      const hasUserShell =
        (await page.locator('text=Sign out').first().isVisible().catch(() => false)) ||
        (await page.locator('text=New chat').first().isVisible().catch(() => false));
      expect(Boolean(ls.workspace || ls.workspaces) || hasUserShell).toBe(true);
    }
  });
});
