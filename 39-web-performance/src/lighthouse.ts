// Lab measurement: Lighthouse, headless, on the Chromium that Playwright ships (no sandbox in a container).
// Default settings: a mid-range phone (Moto G Power viewport), simulated slow 4G (150 ms RTT, 1.6 Mbps down) and a
// 4x CPU slowdown, applied by Lighthouse's Lantern model to a trace taken without throttling.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import type { Result } from "lighthouse";
import { CHROME, OUT, PORT } from "./paths.js";

export interface LabSummary {
  page: string;
  score: number;
  lcp: number;
  cls: number;
  tbt: number;
  fcp: number;
  si: number;
  scriptBytes: number;
  imageBytes: number;
  totalBytes: number;
  requests: number;
  lcpElement: string;
  renderBlocking: string[];
  version: string;
}

export async function audit(page: "slow" | "fast"): Promise<{ lhr: Result; summary: LabSummary }> {
  const chrome = await chromeLauncher.launch({ chromePath: CHROME, chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  try {
    const runner = await lighthouse(`http://localhost:${PORT}/${page}/?profile=lighthouse`, { port: chrome.port, output: ["html", "json"], logLevel: "error", onlyCategories: ["performance"] });
    if (!runner) throw new Error("lighthouse returned nothing");
    mkdirSync(OUT, { recursive: true });
    const [html] = runner.report as string[];
    writeFileSync(join(OUT, `lighthouse-${page}.html`), html);
    const lhr = runner.lhr;
    const a = lhr.audits;
    const items = (id: string) => ((a[id]?.details as { items?: Record<string, unknown>[] } | undefined)?.items ?? []) as Record<string, unknown>[];
    const resource = (type: string) => items("resource-summary").find((i) => i.resourceType === type) as { transferSize: number; requestCount: number } | undefined;
    const lcpNode = items("lcp-breakdown-insight").find((i) => i.type === "node") as { selector?: string } | undefined;
    const summary: LabSummary = {
      page,
      score: Math.round((lhr.categories.performance.score ?? 0) * 100),
      lcp: Math.round(a["largest-contentful-paint"].numericValue!),
      cls: Number(a["cumulative-layout-shift"].numericValue!.toFixed(3)),
      tbt: Math.round(a["total-blocking-time"].numericValue!),
      fcp: Math.round(a["first-contentful-paint"].numericValue!),
      si: Math.round(a["speed-index"].numericValue!),
      scriptBytes: resource("script")?.transferSize ?? 0,
      imageBytes: resource("image")?.transferSize ?? 0,
      totalBytes: resource("total")?.transferSize ?? 0,
      requests: resource("total")?.requestCount ?? 0,
      lcpElement: lcpNode?.selector ?? "",
      version: lhr.lighthouseVersion,
      renderBlocking: items("render-blocking-insight").concat(items("render-blocking-resources")).map((i) => String(i.url ?? "").replace(`http://localhost:${PORT}`, "")).filter(Boolean),
    };
    return { lhr, summary };
  } finally {
    chrome.kill();
  }
}

if (process.argv[1]?.endsWith("lighthouse.ts")) {
  for (const page of ["slow", "fast"] as const) console.log((await audit(page)).summary);
}
