import { test as setup, expect } from '@playwright/test';
import { existsSync, statSync } from 'node:fs';

const AUTH_FILE = '/tmp/shre-chat-auth.json';

setup('authenticate', async ({ page }) => {
  setup.setTimeout(90_000);
  const baseOrigin = new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5510').origin;
  const loginViaApi = async () => {
    const res = await page.request.post('/api/auth/login', {
      data: { username: 'rapidnir', password: 'rapid@nir' },
      headers: { Origin: baseOrigin },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok()) return null;

    if (data?.requiresTwoFactor || data?.requires2FA) {
      const code = process.env.E2E_OTP_CODE || process.env.DEV_OTP_BYPASS_CODE || '123456';
      const verifyRes = await page.request.post('/api/auth/verify-2fa', {
        data: {
          username: 'rapidnir',
          code,
          challengeToken: data.challengeToken,
          challengeJwt: data.challengeJwt,
          trustDevice: true,
        },
        headers: { Origin: baseOrigin },
      });
      if (!verifyRes.ok()) return null;
      return verifyRes.json();
    }

    return data?.token ? data : null;
  };

  const installApiAuth = async (loginData: any) => {
    await page.evaluate((data) => {
      sessionStorage.setItem('shre-auth-token', data.token);
      localStorage.setItem('shre-auth-token', data.token);
      localStorage.setItem('shre-auth-user', JSON.stringify(data.user));
      if (data.workspace) {
        localStorage.setItem('shre-auth-workspace', JSON.stringify(data.workspace));
      }
      if (data.workspaces) {
        localStorage.setItem('shre-auth-workspaces', JSON.stringify(data.workspaces));
      }
    }, loginData);
  };

  // Reuse recent auth state if available (less than 10 minutes old)
  // This avoids hitting the login rate limit (5 attempts per 15 min)
  if (existsSync(AUTH_FILE)) {
    const age = Date.now() - statSync(AUTH_FILE).mtimeMs;
    if (age < 10 * 60_000) {
      // Verify the saved auth state still works
      await page
        .context()
        .addCookies(
          JSON.parse((await import('node:fs')).readFileSync(AUTH_FILE, 'utf-8')).cookies || [],
        );
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const textarea = page.locator(
        'textarea#shre-chat-textarea, textarea[placeholder*="Message" i], textarea[aria-label*="Message" i]',
      );
      const valid = await textarea.isVisible({ timeout: 10_000 }).catch(() => false);
      if (valid) {
        // Auth state still works — no need to re-login
        return;
      }
    }
  }

  // Retry navigation up to 3 times to handle flaky server startup
  let loaded = false;
  for (let attempt = 0; attempt < 3 && !loaded; attempt++) {
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      loaded = true;
    } catch {
      if (attempt < 2) await page.waitForTimeout(2000);
    }
  }

  // Wait for either login form or chat textarea (already authenticated)
  const loginDetector = page.locator('text=Sign in to continue');
  const chatTextarea = page.locator(
    'textarea#shre-chat-textarea, textarea[placeholder*="Message" i], textarea[aria-label*="Message" i]',
  );

  const which = await Promise.race([
    loginDetector.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'login' as const),
    chatTextarea.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'chat' as const),
  ]).catch(() => 'unknown' as const);

  if (which === 'login') {
    // First try non-UI API login for stability in CI/local flaky UI boot.
    const apiLogin = await loginViaApi();
    if (apiLogin) {
      await installApiAuth(apiLogin);
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForSelector(
        'textarea#shre-chat-textarea, textarea[placeholder*="Message" i], textarea[aria-label*="Message" i]',
        { timeout: 40_000 },
      );
      await page.context().storageState({ path: AUTH_FILE });
      return;
    }

    // Fill username
    const usernameInput = page.locator('input[type="text"], input:not([type])').first();
    await usernameInput.click();
    await usernameInput.fill('rapidnir');

    // Fill password
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.click();
    await passwordInput.fill('rapid@nir');

    // Wait for form validation to enable the Sign In button
    await page.waitForTimeout(500);

    // Click Sign In button
    const signInBtn = page.locator('button:has-text("Sign In")').first();
    await signInBtn.waitFor({ state: 'visible', timeout: 5000 });

    // Wait for button to become enabled
    try {
      await page.waitForFunction(
        () => {
          const btns = document.querySelectorAll('button');
          for (const btn of btns) {
            if (btn.textContent?.includes('Sign In') && !btn.disabled) return true;
          }
          return false;
        },
        { timeout: 5000 },
      );
    } catch {
      // Force click anyway
    }

    await signInBtn.click({ force: true });

    // Check for rate limit error
    const rateLimitError = page.locator('text=/Too many login attempts/i');
    const isRateLimited = await rateLimitError.isVisible({ timeout: 3000 }).catch(() => false);
    if (isRateLimited) {
      // Rate limited — if we have any auth file at all, use it and hope for the best
      if (existsSync(AUTH_FILE)) {
        console.log('WARN: Login rate-limited, reusing stale auth state');
        return;
      }
      throw new Error(
        'Login rate-limited and no cached auth state available. Wait 15 minutes and retry.',
      );
    }

    // Wait for chat app to load after login
    await page.waitForSelector(
      'textarea#shre-chat-textarea, textarea[placeholder*="Message" i], textarea[aria-label*="Message" i]',
      { timeout: 40_000 },
    );
  } else if (which === 'chat') {
    // Already authenticated
  } else {
    // Fallback: attempt API login, then verify chat.
    const apiLogin = await loginViaApi();
    if (!apiLogin) {
      throw new Error(
        'Auth setup failed: neither login UI nor chat became ready, and API login failed.',
      );
    }
    await installApiAuth(apiLogin);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector(
      'textarea#shre-chat-textarea, textarea[placeholder*="Message" i], textarea[aria-label*="Message" i]',
      { timeout: 40_000 },
    );
  }

  await page.context().storageState({ path: AUTH_FILE });
});
