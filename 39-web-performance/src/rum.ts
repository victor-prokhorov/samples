// Simulated field traffic: real Chromium visits, each with a network and CPU profile, a member who waits for the page,
// clicks "Show full history", then leaves. The page's own web-vitals code reports to the collector, exactly as it
// would for a real visitor; nothing here reads the metrics from the page.
import { chromium } from "playwright-core";
import { PORT } from "./paths.js";

// Throughput in bytes per second, latency in ms, CPU slowdown factor. Desktop has no throttling at all.
export const PROFILES = {
  desktop: null,
  "4g": { download: (9 * 1024 * 1024) / 8, upload: (1.5 * 1024 * 1024) / 8, latency: 60, cpu: 2 },
  "slow-4g": { download: (4 * 1024 * 1024) / 8, upload: (1 * 1024 * 1024) / 8, latency: 120, cpu: 4 },
} as const;

export type Profile = keyof typeof PROFILES;

export async function visit(page: "slow" | "fast", profile: Profile) {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    // A fresh context per visit: an empty cache, like a first visit of the month.
    const context = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
    const tab = await context.newPage();
    const p = PROFILES[profile];
    if (p) {
      const cdp = await context.newCDPSession(tab);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, downloadThroughput: p.download, uploadThroughput: p.upload, latency: p.latency });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
    }
    const started = Date.now();
    await tab.goto(`http://localhost:${PORT}/${page}/?profile=${profile}`, { waitUntil: "load", timeout: 120_000 });
    await tab.waitForTimeout(1500); // reads the page; the slow page's late notice arrives meanwhile
    await tab.locator("#all").tap();
    await tab.waitForFunction(() => document.querySelectorAll("#rows tr").length > 12 && !document.querySelector("#rows.collapsed"), undefined, { timeout: 60_000 });
    await tab.waitForTimeout(300);
    // Leaving the page makes it hidden: web-vitals reports the final LCP, CLS and INP, sendBeacon delivers them.
    await tab.goto("about:blank");
    await tab.waitForTimeout(200);
    return Date.now() - started;
  } finally {
    await browser.close();
  }
}
