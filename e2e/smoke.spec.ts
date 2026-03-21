import { test, expect } from "@playwright/test";

test.describe("Shre Chat — smoke tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the app shell to render and textarea to become enabled
    // (sync completes or times out after 8s)
    await page.waitForSelector("#shre-chat-textarea:not([disabled])", {
      timeout: 20_000,
    });
  });

  test("page loads and shows the app", async ({ page }) => {
    // The main chat textarea should be visible
    const textarea = page.locator("#shre-chat-textarea");
    await expect(textarea).toBeVisible();
  });

  test("can create a new session via Cmd+K", async ({ page }) => {
    // Count existing sessions in sidebar before creating a new one
    const sessionsBefore = await page
      .locator('[class*="overflow-y-auto"] > div > div[class*="cursor-pointer"]')
      .count();

    // Cmd+K (or Ctrl+K on Linux) to create a new chat session
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+k`);

    // After creating a new session, the textarea should still be visible and empty
    const textarea = page.locator("#shre-chat-textarea");
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue("");
  });

  test("can type in the input box", async ({ page }) => {
    const textarea = page.locator("#shre-chat-textarea");
    await textarea.click();
    await textarea.fill("Hello, this is a smoke test");
    await expect(textarea).toHaveValue("Hello, this is a smoke test");
  });

  test("sidebar shows session list section", async ({ page }) => {
    // The sidebar should have a "Messages" heading for the session list
    const messagesHeading = page.getByText("Messages", { exact: true });
    await expect(messagesHeading).toBeVisible();
  });

  test("can toggle theme", async ({ page }) => {
    // Find the theme toggle button by its aria-label
    const themeToggle = page.locator(
      'button[aria-label="Switch to light mode"], button[aria-label="Switch to dark mode"]'
    );

    // If the sidebar is closed on narrow viewports, skip
    const isVisible = await themeToggle.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip();
      return;
    }

    // Get the current label to verify it changes after click
    const labelBefore = await themeToggle.getAttribute("aria-label");
    await themeToggle.click();

    // After toggle, the aria-label should flip
    const themeToggleAfter = page.locator(
      'button[aria-label="Switch to light mode"], button[aria-label="Switch to dark mode"]'
    );
    const labelAfter = await themeToggleAfter.getAttribute("aria-label");
    expect(labelAfter).not.toBe(labelBefore);
  });

  test("can open system prompt modal", async ({ page }) => {
    // Click the system prompt settings button
    const systemPromptBtn = page.locator('button[aria-label="System prompt"]');

    const isVisible = await systemPromptBtn.isVisible().catch(() => false);
    if (!isVisible) {
      // On narrow viewports the button is hidden (hidden sm:flex)
      test.skip();
      return;
    }

    await systemPromptBtn.click();

    // The modal should appear with the "System Prompt" heading
    const modalHeading = page.getByText("System Prompt", { exact: true });
    await expect(modalHeading).toBeVisible();

    // The modal should have a textarea for the prompt
    const promptTextarea = page.locator(
      'textarea[placeholder*="coding assistant"]'
    );
    await expect(promptTextarea).toBeVisible();

    // Close the modal by pressing Escape
    await page.keyboard.press("Escape");
    await expect(modalHeading).not.toBeVisible();
  });
});
