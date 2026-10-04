import { defineConfig, devices } from "@playwright/test";

// The journeys against the real thing: the IdP and `next start` (after `npm run build`), over the seeded database.
// One worker: the journeys share the database and run in order (journey 3 approves the change journey 1 asks for).
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"], ["json", { outputFile: process.env.REPORT ?? "test-results/e2e.json" }]],
  use: { baseURL: "http://localhost:53059", actionTimeout: 10_000, ...devices["Desktop Chrome"], launchOptions: { args: ["--no-sandbox"] } },
  webServer: [
    { command: "npx tsx src/idp.ts", url: "http://127.0.0.1:53159/.well-known/openid-configuration", reuseExistingServer: false, stdout: "ignore", stderr: "ignore" },
    { command: "npx next start -p 53059", url: "http://localhost:53059/", reuseExistingServer: false, stdout: "ignore", env: { NEXT_TELEMETRY_DISABLED: "1" } },
  ],
});
