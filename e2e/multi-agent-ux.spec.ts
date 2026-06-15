import { test, expect } from '@playwright/test';

/**
 * Multi-agent composer UX — the rendered behaviour unit tests can't reach:
 * @@ agent mentions, #tool arming, the /help grammar, /skills, and the
 * multi-task fan-out affordance. The pure logic (parseComposerToken,
 * buildSwitchNotice, planFanout) is unit-tested in src/__tests__; these specs
 * verify it actually wires through the live composer.
 */
test.describe('Multi-agent composer UX', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
  });

  test('@@ opens the agent mention dropdown with descriptions/domains', async ({ page }) => {
    const ta = page.locator('#shre-chat-textarea');
    await ta.click();
    await ta.fill('@@');
    const menu = page.locator('text=Mention Agent').first();
    await expect(menu).toBeVisible({ timeout: 5000 });
    // At least one agent row renders (name + secondary line). Domain badges are
    // optional per-agent, so we only assert a row exists.
    const firstRow = page.locator("[data-mention-active]").first();
    await expect(firstRow).toBeVisible({ timeout: 5000 });
  });

  test('@@ filters agents as you type', async ({ page }) => {
    const ta = page.locator('#shre-chat-textarea');
    await ta.click();
    await ta.fill('@@a');
    const menu = page.locator('text=Mention Agent').first();
    await expect(menu).toBeVisible({ timeout: 5000 });
    const rows = page.locator('[data-mention-active]');
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('# opens the tool-arming dropdown', async ({ page }) => {
    const ta = page.locator('#shre-chat-textarea');
    await ta.click();
    await ta.fill('pull sales #');
    const menu = page.locator('text=Arm Tool').first();
    // Tool list comes from /api/tools; skip cleanly if this workspace has none.
    const appeared = await menu.isVisible({ timeout: 5000 }).catch(() => false);
    if (!appeared) {
      test.skip(true, 'No tools available in this workspace');
      return;
    }
    await expect(menu).toBeVisible();
    await expect(page.locator('[data-tool-active]').first()).toBeVisible();
  });

  test('compound message surfaces the "Run as tasks" fan-out affordance', async ({ page }) => {
    const ta = page.locator('#shre-chat-textarea');
    await ta.click();
    await ta.fill('remind me to generate payroll tomorrow and fetch me today sales');
    const runBtn = page.locator('button:has-text("Run as tasks")');
    await expect(runBtn).toBeVisible({ timeout: 5000 });
  });

  test('a plain message does NOT show the fan-out affordance', async ({ page }) => {
    const ta = page.locator('#shre-chat-textarea');
    await ta.click();
    await ta.fill("what were today's sales?");
    const runBtn = page.locator('button:has-text("Run as tasks")');
    await expect(runBtn).toHaveCount(0);
  });

  test('/help documents the composer grammar (#tool, @@agent, /skill)', async ({ page }) => {
    const ta = page.locator('#shre-chat-textarea');
    await ta.click();
    await ta.fill('/help');
    await page.keyboard.press('Enter');
    // The help message lists the grammar table.
    await expect(page.locator('text=Composer shortcuts').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=/#tool/').first()).toBeVisible({ timeout: 5000 });
  });

  test('/skills queries the live skills catalog', async ({ page }) => {
    const ta = page.locator('#shre-chat-textarea');
    await ta.click();
    await ta.fill('/skills');
    await page.keyboard.press('Enter');
    // Either the catalog renders or a clear "unavailable" message — both prove
    // the command is wired to the /api/skills proxy (not a no-op).
    const result = page
      .locator('text=/Ecosystem skills|Skills matching|Skills unavailable|No skills found/')
      .first();
    await expect(result).toBeVisible({ timeout: 15_000 });
  });

  // The switch-chip TRIGGER (the gating effect) is unit-tested via
  // shouldEmitSwitchNotice; here we verify the RENDER path deterministically by
  // seeding a session whose transcript already holds a switch-notice message,
  // then asserting the SwitchNoticeChip renders. No backend round-trip.
  test('switch-notice chip renders in the transcript', async ({ page }) => {
    // Keep the seeded local session authoritative: the startup server-sync
    // round-trips messages and drops their `meta` (so the chip would render as
    // plain text). Returning an empty server set makes syncWithServer keep the
    // local copy (meta intact).
    await page.route('**/api/chat-sessions/sync', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [] }),
      }),
    );
    await page.addInitScript(() => {
      const sid = 'qa-switch-chip';
      const now = 1_700_000_000_000;
      const session = {
        id: sid,
        title: 'QA switch chip',
        agentId: 'main',
        createdAt: now,
        updatedAt: now + 3,
        messages: [
          { role: 'user', content: 'hi', timestamp: now },
          { role: 'assistant', content: 'hello', timestamp: now + 1 },
          {
            role: 'assistant',
            content: '📊 **Agent switched to Analytics** — Sales & inventory insights',
            timestamp: now + 2,
            meta: {
              system: 'true',
              kind: 'switch',
              switchKind: 'agent',
              switchLabel: 'Analytics',
              switchEmoji: '📊',
              switchDescription: 'Sales & inventory insights',
            },
          },
        ],
      };
      localStorage.setItem('shre-sessions', JSON.stringify([session]));
      localStorage.setItem('shre-active-session', sid);
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#shre-chat-textarea:not([disabled])', { timeout: 30_000 });
    // The chip renders "Agent → Analytics — …" (distinct from a plain message).
    await expect(page.locator('text=/Agent →/').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=Analytics').first()).toBeVisible();
  });
});
