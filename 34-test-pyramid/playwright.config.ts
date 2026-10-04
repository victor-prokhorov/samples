import { defineConfig, devices } from "@playwright/test";

// The top of the pyramid: one browser, one worker, the real app on :53044 over a real database.
// LATENCY_MS is passed through for the flaky-versus-robust demonstration.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  retries: 0,
  timeout: 15_000,
  reporter: [["list"], ["json", { outputFile: process.env.REPORT ?? ".tmp/e2e.json" }]],
  use: { baseURL: "http://localhost:53044", actionTimeout: 5_000, ...devices["Desktop Chrome"], launchOptions: { args: ["--no-sandbox"] } },
  webServer: {
    command: "npx tsx src/server.ts",
    url: "http://localhost:53044/",
    reuseExistingServer: false,
    env: { DATABASE: "pyramid", LATENCY_MS: process.env.LATENCY_MS ?? "" },
    stdout: "pipe",
  },
});
