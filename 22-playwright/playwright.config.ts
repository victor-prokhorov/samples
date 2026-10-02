import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  timeout: 10_000,
  workers: 2,
  reporter: [["list"], ["json", { outputFile: process.env.REPORT ?? "reports/e2e.json" }]],
  use: { trace: "retain-on-failure", actionTimeout: 5_000, ...devices["Desktop Chrome"] },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", testMatch: /\.spec\.ts/, dependencies: ["setup"], use: { storageState: ".auth/alice.json" } },
  ],
});
