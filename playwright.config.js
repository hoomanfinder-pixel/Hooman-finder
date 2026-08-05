import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 120_000,
  reporter: [["html", { open: "never" }]],
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /mobile-flow\.spec\.js/,
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
      testMatch: /mobile-flow\.spec\.js/,
    },
  ],
  webServer: {
    command:
      "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 600_000,
  },
});
