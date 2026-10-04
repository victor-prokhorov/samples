// The story step by step, with checks. Starts the origin and the shared cache as separate processes.
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { CACHE, ORIGIN, db } from "./db.js";
import { CSS_URL, JS_URL } from "./shared.js";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean) {
  if (cond) passed++;
  else failed++;
  console.log(`   ${cond ? "ok  " : "FAIL"} ${label}`);
  if (!cond) process.exitCode = 1;
}
function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

const children = new Set<ChildProcess>();
function start(file: string, ready: RegExp, env: Record<string, string> = {}): Promise<ChildProcess> {
  const child = spawn(process.execPath, ["--import", "tsx", file], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, ...env } });
  children.add(child);
  return new Promise((resolve, reject) => {
    let up = false;
    createInterface({ input: child.stdout! }).on("line", (line) => {
      console.log(`   ${line}`);
      if (!up && ready.test(line)) {
        up = true;
        resolve(child);
      }
    });
    child.on("exit", (code) => !up && reject(new Error(`${file} exited with ${code}`)));
  });
}
async function stop(child: ChildProcess) {
  children.delete(child);
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
}

const as = (member: number, lang = "en-GB,en;q=0.9") => ({ cookie: `session=session-${member}`, "accept-language": lang });
async function get(base: string, path: string, headers: Record<string, string> = {}) {
  const t = performance.now();
  const r = await fetch(base + path, { headers });
  const body = await r.text();
  return { status: r.status, ms: performance.now() - t, h: (n: string) => r.headers.get(n) ?? "", body };
}
const admin = async (path: string) => (await fetch(`${CACHE}/__cache/${path}`, { method: "POST" })).json();
const cacheStats = async (reset = false) => (await fetch(`${CACHE}/__cache/stats${reset ? "?reset=1" : ""}`)).json();
const originStats = async (reset = false) => (await fetch(`${ORIGIN}/__origin/stats${reset ? "?reset=1" : ""}`)).json() as Promise<Record<string, number>>;
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};

// A morning's traffic from many browsers with empty caches: assets, the fund list, the help page in both languages, personal pages.
const LANGS = ["en-GB,en;q=0.9", "fr-FR,fr;q=0.9,en;q=0.8", "fr", "en-US,en;q=0.9", "fr-CA,fr;q=0.9,en;q=0.7", "de-DE,de;q=0.9,en;q=0.5"];
const MIX: [string, string, number][] = [
  ["asset", CSS_URL, 20],
  ["asset", JS_URL, 20],
  ["funds", "/api/funds", 25],
  ["help", "/help/contributions", 15],
  ["personal", "/members/me", 10],
  ["personal", "/api/me", 10],
];
async function load(base: string, total = 1500, concurrency = 16) {
  let seed = 44;
  const rand = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  const plan = Array.from({ length: total }, () => {
    let x = rand() * 100;
    const [type, path] = MIX.find(([, , w]) => (x -= w) < 0)!;
    return { type, path, member: 1 + Math.floor(rand() * 50), lang: LANGS[Math.floor(rand() * LANGS.length)] };
  });
  const results: { type: string; ms: number; xcache: string }[] = [];
  let next = 0;
  const t = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < plan.length) {
        const p = plan[next++];
        const r = await get(base, p.path, as(p.member, p.lang));
        if (r.status !== 200) throw new Error(`${p.path} -> ${r.status}`);
        results.push({ type: p.type, ms: r.ms, xcache: r.h("x-cache") });
      }
    }),
  );
  return { results, wall: performance.now() - t };
}

async function fundPrice(base: string) {
  const r = await get(base, "/api/funds", as(3));
  return { price: JSON.parse(r.body).funds[0].price as number, xcache: r.h("x-cache"), age: r.h("age"), ms: r.ms };
}

async function main() {
  let origin = await start("src/origin.ts", /member pages and API/);
  await start("src/cache.ts", /shared cache on/);

  step("1. Cache-Control per resource type (straight from the origin)", "the origin decides who may store each response and for how long; a shared cache and a browser read the same header differently (s-maxage and private are for shared caches)");
  const show = async (label: string, path: string, headers: Record<string, string>) => {
    const r = await get(ORIGIN, path, headers);
    console.log(`   ${label.padEnd(18)} ${path.padEnd(32)} ${r.status}  Cache-Control: ${r.h("cache-control")}${r.h("vary") ? `  Vary: ${r.h("vary")}` : ""}${r.h("cache-tag") ? `  Cache-Tag: ${r.h("cache-tag")}` : ""}  ETag: ${r.h("etag")}`);
    return r;
  };
  const asset = await show("hashed asset", CSS_URL, {});
  const me = await show("personal (JSON)", "/api/me", as(1));
  const page = await show("personal (page)", "/members/me", as(1));
  const funds = await show("shared reference", "/api/funds", as(1));
  const help = await show("bilingual page", "/help/contributions", as(1, "fr-FR,fr;q=0.9"));
  check("hashed assets are public, a year, immutable", asset.h("cache-control") === "public, max-age=31536000, immutable");
  check("personal data is private, no-cache, with an ETag", me.h("cache-control") === "private, no-cache" && page.h("cache-control") === "private, no-cache" && me.h("etag") !== "");
  check("shared reference data: s-maxage with stale-while-revalidate, an ETag and a tag to purge by", funds.h("cache-control").includes("s-maxage=300") && funds.h("cache-control").includes("stale-while-revalidate=60") && funds.h("cache-tag") === "funds");
  check("the bilingual page says it varies by Accept-Language, and answered in French", help.h("vary") === "Accept-Language" && help.h("content-language") === "fr" && help.body.includes("cotisations"));

  step("2. Conditional GET: 304 Not Modified", "the client sends back the ETag it has in If-None-Match; if nothing changed the origin answers 304 with no body");
  const me304 = await get(ORIGIN, "/api/me", { ...as(1), "if-none-match": me.h("etag") });
  console.log(`   /api/me with If-None-Match ${me.h("etag")}: ${me304.status}, ${me304.body.length} body bytes (the 200 was ${me.body.length})`);
  const fullFunds = await get(ORIGIN, "/api/funds", as(1));
  const funds304 = await get(ORIGIN, "/api/funds", { ...as(1), "if-none-match": funds.h("etag") });
  console.log(`   /api/funds 200 in ${fullFunds.ms.toFixed(1)} ms (${fullFunds.body.length} bytes); with If-None-Match ${funds.h("etag")}: ${funds304.status} in ${funds304.ms.toFixed(1)} ms (the ETag is the data version: no query to run)`);
  check("both answer 304 with an empty body", me304.status === 304 && me304.body === "" && funds304.status === 304 && funds304.body === "");
  check("the version-based ETag makes the 304 cheaper than the 200", funds304.ms < fullFunds.ms);
  // The browser side of the same headers: a real Chromium, talking to the origin with no shared cache in between.
  await originStats(true);
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "session", value: "session-1", domain: "localhost", path: "/" }]);
  const tab = await ctx.newPage();
  await tab.goto(`${ORIGIN}/members/me`);
  await tab.goto(`${ORIGIN}/help/contributions`);
  await tab.goto(`${ORIGIN}/members/me`);
  const seen = await originStats(true);
  console.log(`   Chromium visited /members/me, /help/contributions, /members/me; the origin saw: ${JSON.stringify(seen)}`);
  check("the browser fetched each asset once (immutable), and revalidated its private page (304) instead of downloading it again", seen["asset 200"] === 2 && seen["/members/me 200"] === 1 && seen["/members/me 304"] === 1);

  step("3. Hit ratio and latency, with and without the shared cache", "1,500 requests from 16 concurrent clients with empty browser caches (50 members, 6 Accept-Language spellings); the cache answers what it may share and passes personal pages through");
  const rows: Record<string, { results: { type: string; ms: number; xcache: string }[]; wall: number; origin: number }> = {};
  for (const [label, base] of [["without cache", ORIGIN], ["with cache", CACHE]] as const) {
    await originStats(true);
    await admin("purge");
    await cacheStats(true);
    const r = await load(base);
    rows[label] = { ...r, origin: sum(await originStats()) };
  }
  const types = ["asset", "funds", "help", "personal", "all"];
  console.log(`   ${"".padEnd(14)} ${"origin requests".padStart(15)} ${"wall s".padStart(7)} ${"req/s".padStart(6)}   p50 / p95 ms by type: ${types.join(", ")}`);
  for (const [label, r] of Object.entries(rows)) {
    const by = (t: string) => r.results.filter((x) => t === "all" || x.type === t).map((x) => x.ms);
    console.log(`   ${label.padEnd(14)} ${String(r.origin).padStart(15)} ${(r.wall / 1000).toFixed(1).padStart(7)} ${String(Math.round(r.results.length / (r.wall / 1000))).padStart(6)}   ${types.map((t) => `${pct(by(t), 50).toFixed(1)} / ${pct(by(t), 95).toFixed(1)}`).join(",  ")}`);
  }
  const cached = rows["with cache"].results;
  const ratio = (t?: string) => {
    const xs = cached.filter((x) => !t || x.type === t);
    return xs.filter((x) => x.xcache === "HIT" || x.xcache === "STALE").length / xs.length;
  };
  console.log(`   hit ratio: all ${(ratio() * 100).toFixed(1)}%, assets ${(ratio("asset") * 100).toFixed(1)}%, funds ${(ratio("funds") * 100).toFixed(1)}%, help ${(ratio("help") * 100).toFixed(1)}%, personal ${(ratio("personal") * 100).toFixed(1)}% (always PASS)`);
  const st = await cacheStats();
  console.log(`   cache outcomes: HIT ${st.HIT}, MISS ${st.MISS}, PASS ${st.PASS}; entries stored: ${st.entries.map((e: { url: string; vary: string }) => e.url.replace(/^\/assets\/app\.\w+/, "/assets/app.<hash>") + (e.vary ? ` [${e.vary}]` : "")).join(", ")}`);
  const p95 = (label: string, t: string) => pct(rows[label].results.filter((x) => t === "all" || x.type === t).map((x) => x.ms), 95);
  check("the shared cache answers at least 75% of requests without the origin", ratio() >= 0.75);
  check("personal pages are never answered from the shared cache", ratio("personal") === 0 && cached.filter((x) => x.type === "personal").every((x) => x.xcache === "PASS"));
  check("the origin gets at least 3 times fewer requests", rows["with cache"].origin * 3 <= rows["without cache"].origin);
  check("the fund list's p95 drops at least 5 times, and the overall p95 at least 2 times", p95("with cache", "funds") * 5 < p95("without cache", "funds") && p95("with cache", "all") * 2 < p95("without cache", "all"));

  step("4. Vary: Accept-Language", "one URL, two languages: the cache keys entries on the request header the response names in Vary, normalised to the language the origin will pick, so 6 spellings make 2 entries");
  for (const lang of LANGS) {
    const r = await get(CACHE, "/help/contributions", as(5, lang));
    console.log(`   Accept-Language: ${lang.padEnd(26)} -> ${r.h("x-cache").padEnd(4)} Content-Language: ${r.h("content-language")}  ${/<h1>([^<]+)/.exec(r.body)?.[1]}`);
  }
  const helpEntries = (await cacheStats()).entries.filter((e: { url: string }) => e.url === "/help/contributions");
  check("two entries for the help page (en, fr), each served to the right readers", helpEntries.length === 2 && (await get(CACHE, "/help/contributions", as(5, "fr-CA,fr;q=0.9"))).body.includes("cotisations"));

  step("5. The privacy bug: a personal page cached as public", "a build sends Cache-Control: public on /members/me (and drops Vary on the help page); the URL is the same for every member, so the shared cache hands member 1's page to member 2");
  await stop(origin);
  origin = await start("src/origin.ts", /member pages and API/, { BUGGY: "1" });
  await admin("purge");
  mkdirSync("screenshots", { recursive: true });
  const visit = async (member: number, file?: string) => {
    const c = await browser.newContext({ viewport: { width: 720, height: 360 } });
    await c.addCookies([{ name: "session", value: `session-${member}`, domain: "localhost", path: "/" }]);
    const p = await c.newPage();
    const res = await p.goto(`${CACHE}/members/me`);
    const name = await p.locator("h1").textContent();
    if (file) {
      // A label added by the test harness (not part of the page), so the screenshot says whose browser it is.
      const note = `Test browser of member ${member} (cookie session=session-${member}). Response from the shared cache: X-Cache ${res?.headers()["x-cache"]}, Cache-Control ${res?.headers()["cache-control"]}`;
      await p.evaluate((text) => {
        const d = document.createElement("div");
        d.textContent = text;
        d.style.cssText = "font:13px/1.4 monospace;border:2px dashed #1b1b1b;padding:6px 8px;margin:0 0 12px";
        document.body.prepend(d);
      }, note);
      await p.screenshot({ path: file });
    }
    await c.close();
    return { name, xcache: res?.headers()["x-cache"], cc: res?.headers()["cache-control"] };
  };
  const a = await visit(1);
  const b = await visit(2, "screenshots/leak-member-2-sees-member-1.png");
  console.log(`   member 1 (Alice) opens /members/me: ${a.name}  [${a.xcache}, Cache-Control: ${a.cc}]`);
  console.log(`   member 2 (Bruno) opens /members/me: ${b.name}  [${b.xcache}]  <- Alice's name, IBAN and balance`);
  check("with the buggy header the shared cache serves member 1's page to member 2", a.name === "Alice Martin" && b.name === "Alice Martin" && b.xcache === "HIT");
  const en = await get(CACHE, "/help/contributions", as(7, "en-GB,en;q=0.9"));
  const fr = await get(CACHE, "/help/contributions", as(8, "fr-FR,fr;q=0.9"));
  console.log(`   without Vary: an English reader fills the entry, then a French reader gets ${/<h1>([^<]+)/.exec(fr.body)?.[1]} [${fr.h("x-cache")}]`);
  check("without Vary the French reader gets the English page", en.h("x-cache") === "MISS" && fr.h("x-cache") === "HIT" && fr.h("content-language") === "en");

  console.log("   deploy the fix (private, no-cache; Vary back) ...");
  await stop(origin);
  origin = await start("src/origin.ts", /member pages and API/);
  const still = await visit(2);
  console.log(`   member 2 right after the deploy: ${still.name} [${still.xcache}]  <- the leaked entry is still fresh for 300 s`);
  check("fixing the origin is not enough: the stored entry keeps leaking until it expires or is purged", still.name === "Alice Martin" && still.xcache === "HIT");
  console.log(`   purge: ${JSON.stringify(await admin("purge?url=/members/me"))} for /members/me, ${JSON.stringify(await admin("purge?url=/help/contributions"))} for /help/contributions`);
  const fixed = await visit(2, "screenshots/fixed-member-2-sees-own-page.png");
  const fixedAgain = await visit(2);
  console.log(`   member 2 after the purge: ${fixed.name} [${fixed.xcache}, Cache-Control: ${fixed.cc}], again: ${fixedAgain.name} [${fixedAgain.xcache}]`);
  const frFixed = await get(CACHE, "/help/contributions", as(8, "fr-FR,fr;q=0.9"));
  check("after the fix and the purge, member 2 sees their own page, never stored (PASS), and French readers get French", fixed.name === "Bruno Lefèvre" && fixed.xcache === "PASS" && fixedAgain.xcache === "PASS" && frFixed.h("content-language") === "fr");
  await browser.close();

  step("6. Data changes: waiting for the TTL versus event-driven invalidation", "with only a TTL a price change waits up to s-maxage (+ stale-while-revalidate); with the outbox the cache purges the tag at commit, so the TTL can stay long and the hit ratio high");
  await admin("invalidation?on=0");
  await admin("purge");
  const p0 = await fundPrice(CACHE);
  await originStats(true);
  await admin("advance?seconds=400");
  const reval = await fundPrice(CACHE);
  const o = await originStats(true);
  console.log(`   fund 1 price ${p0.price} [${p0.xcache}]; 400 s later, nothing changed: [${reval.xcache}], origin answered ${JSON.stringify(o)}`);
  check("past s-maxage + stale-while-revalidate the cache revalidates with If-None-Match, and the origin answers 304", reval.xcache === "REVALIDATED" && o["/api/funds 304"] === 1 && !o["/api/funds 200"]);
  await db.query("UPDATE fund_prices SET price = price * 1.10 WHERE fund_id = 1 AND day = '2026-09-30'");
  const real1 = Number((await db.query("SELECT price FROM fund_prices WHERE fund_id = 1 AND day = '2026-09-30'")).rows[0].price);
  console.log(`   UPDATE fund_prices: fund 1 is now ${real1} in Postgres (invalidation off)`);
  const timeline: string[] = [];
  for (const [label, advance] of [["right after", 0], ["+290 s", 290], ["+20 s (age 310, stale)", 20], ["next request", 0]] as const) {
    if (advance) await admin(`advance?seconds=${advance}`);
    const r = await fundPrice(CACHE);
    timeline.push(`${label}: ${r.price} [${r.xcache}, Age ${r.age}]`);
    // wait for the background revalidation to land before the next request
    for (let i = 0; r.xcache === "STALE" && i < 100 && (await cacheStats()).entries.some((e: { url: string; age: number }) => e.url === "/api/funds" && e.age >= 300); i++) await sleep(50);
  }
  for (const line of timeline) console.log(`     ${line}`);
  check("with only the TTL the old price is served for 300 s, then once more while revalidating (stale-while-revalidate), then the new one", timeline[0].startsWith(`right after: ${p0.price}`) && timeline[1].includes(`${p0.price} [HIT`) && timeline[2].includes("STALE") && timeline[3].startsWith(`next request: ${real1}`));

  await admin("invalidation?on=1");
  await fundPrice(CACHE);
  const before = await fundPrice(CACHE);
  await db.query("UPDATE fund_prices SET price = price * 1.05 WHERE fund_id = 1 AND day = '2026-09-30'");
  const committed = performance.now();
  const real2 = Number((await db.query("SELECT price FROM fund_prices WHERE fund_id = 1 AND day = '2026-09-30'")).rows[0].price);
  let fresh = before;
  while (fresh.price !== real2 && performance.now() - committed < 5000) fresh = await fundPrice(CACHE);
  const waited = performance.now() - committed;
  console.log(`   invalidation on: ${before.price} [${before.xcache}] -> UPDATE (now ${real2}) -> ${fresh.price} [${fresh.xcache}] ${waited.toFixed(0)} ms after the commit`);
  check("with the outbox the next request after the commit misses and gets the new price within a second", fresh.price === real2 && fresh.xcache === "MISS" && waited < 1000);

  console.log("   the cache's LISTEN connection drops (pg_terminate_backend), and a price changes while it is gone:");
  await fundPrice(CACHE);
  await db.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'cache-invalidation'");
  await db.query("UPDATE fund_prices SET price = price * 0.97 WHERE fund_id = 1 AND day = '2026-09-30'");
  const lost = performance.now();
  const real3 = Number((await db.query("SELECT price FROM fund_prices WHERE fund_id = 1 AND day = '2026-09-30'")).rows[0].price);
  let caught = await fundPrice(CACHE);
  while (caught.price !== real3 && performance.now() - lost < 5000) {
    await sleep(50);
    caught = await fundPrice(CACHE);
  }
  console.log(`   price ${real3} served [${caught.xcache}] ${(performance.now() - lost).toFixed(0)} ms after the commit: the NOTIFY was lost, the outbox row was not`);
  check("after reconnecting, the cache replays the outbox from the last id it saw and purges", caught.price === real3);
  const outbox = (await db.query("SELECT count(*)::int AS n FROM cache_invalidations")).rows[0].n;
  check("every change left one outbox row", outbox === 3);

  console.log(`\n== ${passed} checks passed, ${failed} failed ==`);
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const c of [...children]) await stop(c);
  await db.end();
}
