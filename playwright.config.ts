import { defineConfig } from "@playwright/test";

const AUTH_FILE = "/tmp/shre-chat-auth.json";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: "https://localhost:5510",
    headless: true,
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { browserName: "chromium" },
    },
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        storageState: AUTH_FILE,
      },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  // Don't start a web server — assume shre-chat is already running on port 5510
});
