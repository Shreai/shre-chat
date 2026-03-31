import { test as setup, expect } from '@playwright/test';

const AUTH_FILE = '/tmp/shre-chat-auth.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Login page may show Username/Password fields — try multiple selectors
  const usernameField = page.locator(
    'input[autocomplete="username"], input[name="username"], input[placeholder*="username" i]',
  ).first();
  const isLoginPage = await usernameField.isVisible({ timeout: 5000 }).catch(() => false);

  if (isLoginPage) {
    await usernameField.fill('rapidnir');
    await page.locator('input[type="password"]').first().fill('rapid@nir');
    // Click Sign In button — matches "Sign In", "Sign in", "Login", submit button
    await page.locator('button:has-text("Sign"), button[type="submit"]').first().click();
    await page.waitForSelector('#shre-chat-textarea', { timeout: 40_000 });
  } else {
    await page.waitForSelector('#shre-chat-textarea', { timeout: 40_000 });
  }

  await page.context().storageState({ path: AUTH_FILE });
});
