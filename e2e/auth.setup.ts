import { test as setup, expect } from "@playwright/test";

const AUTH_FILE = "/tmp/shre-chat-auth.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const usernameField = page.locator('input[autocomplete="username"]').first();
  const isLoginPage = await usernameField.isVisible({ timeout: 5000 }).catch(() => false);

  if (isLoginPage) {
    await usernameField.fill("rapidnir");
    await page.locator('input[type="password"]').fill("rapid@nir");
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector("#shre-chat-textarea", { timeout: 40_000 });
  } else {
    await page.waitForSelector("#shre-chat-textarea", { timeout: 40_000 });
  }

  await page.context().storageState({ path: AUTH_FILE });
});
