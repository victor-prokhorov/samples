// The story: a slow member page nobody measured, the same page fixed, and three measurements with one set of budgets:
// the bundle at build time, Lighthouse in the lab, Core Web Vitals from visits in the field.
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { bundleBudget, fieldBudget, labBudget, printVerdicts, reportHtml, show, type Verdict } from "./budgets.js";
import { buildAll } from "./build.js";
import { METRICS, p75, readBeacons, resetStore, startCollector, summary } from "./collector.js";
import { type LabSummary, audit } from "./lighthouse.js";
import { COLLECTOR_PORT, DIST, OUT, PORT, ROOT } from "./paths.js";
import { PROFILES, type Profile, visit } from "./rum.js";
import { startServer } from "./server.js";

const failures: string[] = [];
function check(label: string, condition: boolean) {
  console.log(`   ${condition ? "ok" : "CHECK FAILED"}: ${label}`);
  if (!condition) {
    failures.push(label);
    process.exitCode = 1;
  }
}

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

const VISITS_PER_PROFILE = Number(process.env.VISITS ?? 4);
const PAGES = ["slow", "fast"] as const;
const kb = (n: number) => `${(n / 1000).toFixed(1)} kB`;

async function main() {
  step("1. Build both versions", "esbuild bundles each page's script and writes a metafile (what each byte of output came from); sharp turns the 2400 px PNG into AVIF and WebP at 480, 800 and 1200 px");
  await buildAll();
  for (const f of readdirSync(join(DIST, "img"))) console.log(`   dist/img/${f.padEnd(16)} ${kb(statSync(join(DIST, "img", f)).size).padStart(10)}`);
  const png = statSync(join(DIST, "img/hero.png")).size;
  const avif = statSync(join(DIST, "img/hero-800.avif")).size;
  check(`the image the fast page loads on a phone (800 px AVIF, ${kb(avif)}) is under 1% of the PNG (${kb(png)})`, avif < png / 100);

  step("2. Bundle-size budget", "budgets.json caps each page's app.js at 30 kB gzip; the metafile says which inputs to blame when it is over");
  const bundles = PAGES.map((p) => ({ page: p, ...bundleBudget(p) }));
  for (const b of bundles) {
    printVerdicts(b.verdicts);
    console.log(`         minified ${kb(b.raw)}; largest inputs: ${b.top.map((t) => `${t.input} ${kb(t.bytes)}`).join(", ")}`);
  }
  const bundleVerdicts = bundles.flatMap((b) => b.verdicts);
  check("the slow bundle is over budget, the fast one within it", bundleVerdicts.some((v) => v.page === "slow" && !v.pass) && bundleVerdicts.filter((v) => v.page === "fast").every((v) => v.pass));
  check("the metafile blames moment's locales and lodash for the slow bundle", /moment-with-locales/.test(bundles[0].top[0].input) && bundles[0].top.some((t) => /lodash/.test(t.input)));

  const server = await startServer();
  try {
    step(
      "3. Lab: Lighthouse on both pages",
      "Lighthouse 13 headless on the Chromium in PLAYWRIGHT_BROWSERS_PATH (chrome-launcher, --no-sandbox): mobile, simulated slow 4G and 4x CPU. It reports LCP, CLS and TBT (the lab stand-in for INP: there is no user to interact) and every byte loaded",
    );
    const lab: LabSummary[] = [];
    for (const p of PAGES) {
      const { summary: s } = await audit(p);
      lab.push(s);
      console.log(`   ${p}: score ${s.score}, LCP ${show(s.lcp, "ms")} (${s.lcpElement}), FCP ${show(s.fcp, "ms")}, CLS ${s.cls}, TBT ${show(s.tbt, "ms")}, ${s.requests} requests, scripts ${kb(s.scriptBytes)}, images ${kb(s.imageBytes)}, total ${kb(s.totalBytes)}`);
      console.log(`         render-blocking: ${s.renderBlocking.join(", ") || "none"}; report out/lighthouse-${p}.html`);
    }
    const labVerdicts = lab.flatMap(labBudget);
    printVerdicts(labVerdicts);
    check("the slow page breaks all four lab budgets (LCP, CLS, TBT, script bytes)", labVerdicts.filter((v) => v.page === "slow").every((v) => !v.pass));
    check("the fast page meets all four", labVerdicts.filter((v) => v.page === "fast").every((v) => v.pass));
    check("Lighthouse names the slow page's three render-blocking resources; the fast page has none", lab[0].renderBlocking.length === 3 && lab[1].renderBlocking.length === 0);
    writeFileSync(join(OUT, "lab-summary.json"), JSON.stringify(lab, null, 2) + "\n");

    step(
      "4. Field: Core Web Vitals from visits, p75",
      "each page runs the web-vitals library and sends every metric with navigator.sendBeacon to the collector on :53149, which appends it to out/vitals.ndjson. Simulated members visit under three network and CPU profiles, read, tap \"Show full history\" (that tap is what INP measures) and leave",
    );
    for (const [name, p] of Object.entries(PROFILES)) console.log(`   profile ${name.padEnd(8)} ${p ? `${((p.download * 8) / 1024 / 1024).toFixed(1)} Mbit/s down, ${p.latency} ms latency, CPU ${p.cpu}x slower` : "no throttling"}`);
    const collector = await startCollector();
    resetStore();
    try {
      for (const p of PAGES)
        for (const profile of Object.keys(PROFILES) as Profile[]) {
          const times: number[] = [];
          for (let i = 0; i < VISITS_PER_PROFILE; i++) times.push(await visit(p, profile));
          console.log(`   ${p} x ${profile.padEnd(8)} ${VISITS_PER_PROFILE} visits, ${times.map((t) => (t / 1000).toFixed(1) + "s").join(" ")}`);
        }
      await new Promise((r) => setTimeout(r, 500));
      const bad = await fetch(`http://localhost:${COLLECTOR_PORT}/vitals`, { method: "POST", body: JSON.stringify({ name: "LCP", value: "fast", page: "slow" }) });
      const served = (await (await fetch(`http://localhost:${COLLECTOR_PORT}/summary`)).json()) as ReturnType<typeof summary>;
      const beacons = readBeacons();
      const visits = PAGES.length * Object.keys(PROFILES).length * VISITS_PER_PROFILE;
      console.log(`   collector stored ${beacons.length} metrics from ${visits} visits; a malformed beacon got HTTP ${bad.status}`);
      check("every visit reported LCP, CLS and INP (and FCP, TTFB)", METRICS.every((m) => beacons.filter((b) => b.name === m).length === visits));
      check("the collector validates what it stores: a beacon with a non-numeric value is refused with 400", bad.status === 400);
      console.log(`   p75 per page and metric (GET /summary), and the median for comparison:`);
      for (const p of PAGES)
        for (const m of METRICS) {
          const vals = beacons.filter((b) => b.page === p && b.name === m).map((b) => b.value).sort((a, b) => a - b);
          const unit = m === "CLS" ? "" : "ms";
          console.log(`     ${p.padEnd(4)} ${m.padEnd(4)} n=${served[p][m].n}  p75 ${show(served[p][m].p75, unit).padStart(9)}  median ${show(vals[Math.floor(vals.length / 2)], unit).padStart(9)}  max ${show(vals.at(-1)!, unit).padStart(9)}`);
        }
      const fieldVerdicts = PAGES.flatMap((p) => fieldBudget(p, served[p]));
      printVerdicts(fieldVerdicts);
      check("in the field the slow page fails LCP, CLS and INP at p75", fieldVerdicts.filter((v) => v.page === "slow").every((v) => !v.pass));
      check("the fast page is good on all three at p75", fieldVerdicts.filter((v) => v.page === "fast").every((v) => v.pass));
      const onDesktop = (m: string) => p75(beacons.filter((b) => b.page === "slow" && b.name === m && b.profile === "desktop").map((b) => b.value));
      check(
        `measured only on an unthrottled desktop, the slow page would look much better: p75 LCP ${show(onDesktop("LCP"), "ms")} and INP ${show(onDesktop("INP"), "ms")}, against ${show(served.slow.LCP.p75, "ms")} and ${show(served.slow.INP.p75, "ms")} over all profiles`,
        onDesktop("LCP") < served.slow.LCP.p75 / 2 && onDesktop("INP") < served.slow.INP.p75,
      );
      writeFileSync(join(OUT, "field-summary.json"), JSON.stringify(served, null, 2) + "\n");

      step("5. One report for both", "out/budgets.html puts every budget, before and after, on one page; the run script and CI fail on the same verdicts");
      const all: Verdict[] = [...bundleVerdicts, ...labVerdicts, ...fieldVerdicts];
      writeFileSync(
        join(OUT, "budgets.html"),
        reportHtml(all, {
          lab: `Lab: Lighthouse ${lab[0].version}, one run per page, mobile, simulated slow 4G, 4x CPU.`,
          field: `Field: p75 of ${visits / 2} visits per page (desktop, 4G, slow 4G), reported by web-vitals with sendBeacon.`,
        }),
      );
      console.log(`   ${all.filter((v) => !v.pass).length} of ${all.length} verdicts over budget, all of them on the slow page`);
      check("every over-budget verdict is on the slow page", all.filter((v) => !v.pass).every((v) => v.page === "slow") && all.filter((v) => v.page === "fast").every((v) => v.pass));
    } finally {
      collector.close();
    }
    // After the collector is closed, so these page loads add nothing to out/vitals.ndjson.
    await screenshots();
  } finally {
    server.close();
  }
  console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nall checks passed");
}

async function screenshots() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const shots: string[] = [];
    // The pages themselves, on a phone-sized viewport, after load: the same content either way.
    for (const p of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 1 });
      const tab = await ctx.newPage();
      await tab.goto(`http://localhost:${PORT}/${p}/?profile=screenshot`, { waitUntil: "load" });
      await tab.waitForTimeout(1200);
      await tab.screenshot({ path: join(ROOT, "screenshots", `page-${p}.png`) });
      shots.push(`page-${p}.png`);
      await ctx.close();
    }
    const tab = await browser.newPage({ viewport: { width: 1000, height: 820 } });
    for (const p of PAGES) {
      await tab.goto(`file://${join(OUT, `lighthouse-${p}.html`)}`);
      await tab.locator(".lh-metrics-container").first().waitFor();
      await tab.waitForTimeout(500);
      await tab.screenshot({ path: join(ROOT, "screenshots", `lighthouse-${p}.png`) });
      shots.push(`lighthouse-${p}.png`);
    }
    await tab.setViewportSize({ width: 980, height: 600 });
    await tab.goto(`file://${join(OUT, "budgets.html")}`);
    await tab.screenshot({ path: join(ROOT, "screenshots", "budgets.png"), fullPage: true });
    shots.push("budgets.png");
    console.log(`   wrote screenshots/${shots.join(", ")}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
