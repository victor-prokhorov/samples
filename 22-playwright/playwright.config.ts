import { basename } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Each run of the demo sets REPORT; its HTML report goes next to the JSON one, in a folder of its own.
const report = process.env.REPORT ?? "reports/e2e.json";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  timeout: 10_000,
  workers: 2,
  reporter: [
    ["list"],
    ["json", { outputFile: report }],
    ["html", { open: "never", outputFolder: `reports/html/${basename(report, ".json")}` }],
  ],
  use: { trace: "retain-on-failure", actionTimeout: 5_000, ...devices["Desktop Chrome"] },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", testMatch: /\.spec\.ts/, dependencies: ["setup"], use: { storageState: ".auth/alice.json" } },
  ],
});
