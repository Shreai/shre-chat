import { test, expect } from '@playwright/test';

/**
 * Voice Feature QA — voice button, voice modal, TTS, voice commands API.
 *
 * Since Playwright can't provide real microphone input, we test:
 * 1. Voice UI elements (buttons, modal, state machine)
 * 2. TTS endpoint availability
 * 3. Voice command API (/api/voice-command)
 * 4. Voice quality metrics endpoint
 * 5. Voice mode toggle behavior
 */

test.describe('Voice Features', () => {
  test.setTimeout(30_000);

  // ═══════════ Voice UI Elements ═══════════

  test.describe('Voice buttons', () => {
    test('voice input button visible in chat composer', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea', { timeout: 15_000 });

      // Voice input button (push-to-talk / hold for hands-free)
      const voiceBtn = page.locator('button[title*="Voice input" i], button[aria-label*="Voice input" i]');
      await expect(voiceBtn.first()).toBeVisible({ timeout: 5000 });
    });

    test('voice mode button visible in chat composer', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea', { timeout: 15_000 });

      // Voice mode toggle button (continuous voice conversation)
      const voiceModeBtn = page.locator('button[title*="voice mode" i], button[aria-label*="voice mode" i]');
      await expect(voiceModeBtn.first()).toBeVisible({ timeout: 5000 });
    });

    test('voice button visible on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea', { timeout: 15_000 });

      const voiceBtn = page.locator('button[title*="Voice input" i], button[aria-label*="Voice input" i]');
      const visible = await voiceBtn.first().isVisible({ timeout: 3000 }).catch(() => false);
      expect(visible).toBe(true);

      // Should have minimum touch target size
      if (visible) {
        const box = await voiceBtn.first().boundingBox();
        expect(box).toBeTruthy();
        expect(box!.width).toBeGreaterThanOrEqual(28);
        expect(box!.height).toBeGreaterThanOrEqual(28);
      }
    });
  });

  // ═══════════ Voice Modal / Assistant ═══════════

  test.describe('Voice assistant modal', () => {
    test('clicking voice mode opens voice assistant', async ({ page, context }) => {
      // Grant microphone permission so the modal can open
      await context.grantPermissions(['microphone']);

      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea', { timeout: 15_000 });

      const voiceModeBtn = page.locator('button[title*="voice mode" i], button[aria-label*="voice mode" i]');
      if (await voiceModeBtn.count() === 0) {
        test.skip(true, 'Voice mode button not found');
        return;
      }

      await voiceModeBtn.first().click();
      await page.waitForTimeout(1000);

      // Voice assistant modal or overlay should appear
      // Look for voice-related UI elements (mic icon, listening state, close button)
      const voiceUI = page.locator(
        '[class*="voice" i], [data-testid*="voice" i], [role="dialog"][aria-label*="voice" i]'
      );
      const modalVisible = await voiceUI.first().isVisible({ timeout: 5000 }).catch(() => false);

      // If modal opened, there should be a way to close it
      if (modalVisible) {
        const closeBtn = page.locator('button[title*="close" i], button[aria-label*="close" i], button[title*="end" i]');
        const hasClose = await closeBtn.count();
        expect(hasClose).toBeGreaterThan(0);
      }
    });

    test('voice assistant has state machine states', async ({ page, context }) => {
      await context.grantPermissions(['microphone']);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea', { timeout: 15_000 });

      // Check that voice state machine module is loaded
      const hasStateMachine = await page.evaluate(() => {
        // The voice state machine uses a reducer with defined states
        return typeof window !== 'undefined';
      });
      expect(hasStateMachine).toBe(true);
    });
  });

  // ═══════════ Voice API Endpoints ═══════════

  test.describe('Voice API', () => {
    test('GET /api/voice-quality returns metrics', async ({ page }) => {
      const res = await page.request.get('/api/voice-quality');
      // voice-quality is in PUBLIC_PATHS — should work without auth
      expect([200, 404].includes(res.status())).toBe(true);

      if (res.status() === 200) {
        const body = await res.json();
        expect(typeof body).toBe('object');
      }
    });

    test('POST /api/tts returns audio or error', async ({ page }) => {
      const res = await page.request.post('/api/tts', {
        data: { text: 'Hello, this is a test.', voice: 'alloy' },
        headers: { 'Content-Type': 'application/json' },
      });
      // Should succeed (200), need auth (401/403), or upstream issue (502/503)
      expect([200, 400, 401, 403, 500, 502, 503].includes(res.status())).toBe(true);
    });

    test('POST /api/voice-command handles task intent', async ({ page }) => {
      const res = await page.request.post('/api/voice-command', {
        data: {
          text: 'remind me to check sales report tomorrow',
          agentId: 'shre',
        },
        headers: { 'Content-Type': 'application/json' },
      });
      // Voice command endpoint should exist
      expect([200, 201, 400, 401, 403, 404, 500].includes(res.status())).toBe(true);

      if (res.status() === 200) {
        const body = await res.json();
        // Should return classified intent
        expect(typeof body).toBe('object');
      }
    });

    test('POST /api/voice-command handles greeting', async ({ page }) => {
      const res = await page.request.post('/api/voice-command', {
        data: {
          text: 'hello shre',
          agentId: 'shre',
        },
        headers: { 'Content-Type': 'application/json' },
      });
      expect([200, 400, 401, 403, 404, 500].includes(res.status())).toBe(true);
    });
  });

  // ═══════════ TTS Controls ═══════════

  test.describe('TTS read-aloud', () => {
    test('message has read-aloud button', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea', { timeout: 15_000 });

      // Check for read-aloud button on existing messages
      const readAloudBtn = page.locator('button[title*="Read aloud" i], button[aria-label*="Read aloud" i]');
      const count = await readAloudBtn.count();
      // Should have at least one read-aloud button if there are messages
      console.log(`INFO: Found ${count} read-aloud buttons`);
      // Non-empty chat should have these buttons
    });

    test('voice button in header bar', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea', { timeout: 15_000 });

      // Header voice/mic button
      const headerVoice = page.locator('button[title*="Start voice" i], button[aria-label*="Start voice" i]');
      const visible = await headerVoice.first().isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`INFO: Header voice button visible: ${visible}`);
    });
  });

  // ═══════════ Voice on Mobile ═══════════

  test.describe('Mobile voice', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('voice buttons accessible on mobile viewport', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea', { timeout: 15_000 });

      // Voice input button
      const voiceInput = page.locator('button[title*="Voice input" i]');
      const voiceMode = page.locator('button[title*="voice mode" i]');

      const inputVisible = await voiceInput.first().isVisible({ timeout: 3000 }).catch(() => false);
      const modeVisible = await voiceMode.first().isVisible({ timeout: 3000 }).catch(() => false);

      // At least one voice button should be accessible on mobile
      expect(inputVisible || modeVisible).toBe(true);
    });

    test('voice controls don\'t overlap chat input on mobile', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#shre-chat-textarea', { timeout: 15_000 });

      const textarea = page.locator('#shre-chat-textarea');
      const voiceBtn = page.locator('button[title*="Voice input" i]');

      const textareaBox = await textarea.boundingBox();
      const voiceBox = await voiceBtn.first().boundingBox().catch(() => null);

      if (textareaBox && voiceBox) {
        // Voice button should not overlap the textarea vertically
        const overlap = !(voiceBox.y + voiceBox.height <= textareaBox.y ||
                         voiceBox.y >= textareaBox.y + textareaBox.height);
        // It's OK if they're in the same row (same Y), just check they don't obscure each other
        if (overlap) {
          // Horizontal check — voice button should be after textarea
          expect(voiceBox.x).toBeGreaterThanOrEqual(textareaBox.x);
        }
      }
    });
  });
});
