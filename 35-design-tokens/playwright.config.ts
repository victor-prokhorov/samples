import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  timeout: 20_000,
  reporter: [["list"], ["json", { outputFile: process.env.REPORT ?? "test-results/report.json" }]],
  // Baselines live next to the tests under readable names (no platform suffix): they are committed, and they are only
  // valid for this Chromium on Linux. Regenerate them in the same container image that CI uses.
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      // The per-pixel colour tolerance. Playwright's default (0.2) misses a brand blue going one step darker (the demo
      // shows it), and 0.05 still missed a dark-theme background change while this sample was built. 0 counts every
      // colour change; anti-aliased pixels are still ignored, and the rendering is deterministic in one container.
      threshold: Number(process.env.VISUAL_THRESHOLD ?? 0),
      maxDiffPixels: 0,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:53045",
    viewport: { width: 1100, height: 800 },
    deviceScaleFactor: 1,
    launchOptions: { args: ["--no-sandbox"] },
  },
  webServer: { command: "npx tsx src/serve.ts", url: "http://localhost:53045/index.json", reuseExistingServer: false, stdout: "ignore" },
});
