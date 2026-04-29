import { test, expect } from '@playwright/test';

  test.describe('Shared memory sync', () => {
  test.setTimeout(90_000);
  const workspaceId = '24c58b2b-67d8-42bd-8377-c0a78054fbc6';
  const agentId = 'ellie';

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const workspaceId = '24c58b2b-67d8-42bd-8377-c0a78054fbc6';
      localStorage.setItem('shre-workspace-id', workspaceId);
      sessionStorage.setItem('shre-workspace-id', workspaceId);
      localStorage.setItem(
        'shre-auth-workspace',
        JSON.stringify({ id: workspaceId, name: workspaceId, role: 'member' }),
      );
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const skipOnboarding = page.getByRole('button', { name: /Skip for now/i });
    if (await skipOnboarding.isVisible().catch(() => false)) {
      await skipOnboarding.click();
    }
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
  });

  test('refreshes the shared panel when a workspace learning is recorded', async ({ page }) => {
    const memoryToggle = page.getByRole('button', { name: /toggle memory panel/i });
    await memoryToggle.click();

    const badge = page.getByTestId('shared-memory-sync-badge');
    await expect(badge).toBeVisible({ timeout: 10_000 });
    await expect(badge).toContainText(/Idle|Live|Refreshing/i);

    const workspaceId = await page.evaluate(
      () => localStorage.getItem('shre-workspace-id') || sessionStorage.getItem('shre-workspace-id'),
    );
    const learningText = `Playwright shared memory ${Date.now()}`;
    const lessonText = `${learningText} refreshed`;
    const token = await page.evaluate(() => localStorage.getItem('shre-auth-token'));

    const response = await page.request.post(
      `http://127.0.0.1:5520/api/agents/${agentId}/memory/learnings`,
      {
      headers: {
        Authorization: 'Bearer ca9ff9b4-56f8-49b6-b5b5-c5aff26f6b01',
        ...(token ? { Cookie: `shre_token=${token}` } : {}),
      },
      data: {
        workspaceId,
        runId: `qa-${Date.now()}`,
        eventType: 'success',
        summary: learningText,
        lesson: lessonText,
        confidence: 0.95,
      },
    });

    expect(response.ok(), `learning write failed: ${await response.text()}`).toBeTruthy();

    await expect(badge).toContainText(/Live|Refreshing/i, { timeout: 15_000 });

    await page.getByRole('button', { name: /^shared$/i }).click();

    const sharedResponse = await page.request.get(
      `http://127.0.0.1:5520/api/workspaces/${workspaceId}/memory/shared?limit=5`,
      {
        headers: {
          Authorization: 'Bearer ca9ff9b4-56f8-49b6-b5b5-c5aff26f6b01',
        },
      },
    );
    expect(sharedResponse.ok(), `shared read failed: ${await sharedResponse.text()}`).toBeTruthy();
    const shared = await sharedResponse.json();
    expect(
      JSON.stringify(shared).includes(lessonText),
      `shared memory did not include ${lessonText}: ${JSON.stringify(shared)}`,
    ).toBeTruthy();
  });
});
