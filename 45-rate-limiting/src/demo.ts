import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import pg from "pg";
import { type Series, requestsChart } from "./chart.js";
import { DATABASE_URL, PORT, appDb as db } from "./db.js";
import { type Hit, Run } from "./load.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(label: string, cond: boolean) {
  console.log(`   ${cond ? "ok" : "FAILED"}: ${label}`);
  if (!cond) process.exitCode = 1;
}

// Acme's jobs start at 0 s; the portals' traffic starts at 1 s, once connections are open and Acme's burst is spent
const RUN_MS = 11_000;
const TENANTS = ["acme", "globex", "initech"];
const pct = (xs: number[], p: number) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

const pctOrNaN = (xs: number[], p: number) => (xs.length ? pct(xs, p) : NaN);

async function startServer(limits: "on" | "off") {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], { stdio: "inherit", env: { ...process.env, LIMITS: limits } });
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`http://localhost:${PORT}/stats`);
      return child;
    } catch {
      await sleep(100);
    }
  }
  throw new Error("server did not start");
}

async function stopServer(child: ChildProcess) {
  child.kill("SIGTERM");
  await once(child, "exit");
}

async function load(name: string, runMs: number, withAcme: boolean) {
  const startAt = Date.now() + 1500;
  let out = "";
  const noisy = withAcme
    ? spawn(process.execPath, ["--import", "tsx", "src/noisy.ts"], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, RUN_MS: String(runMs), START_AT: String(startAt) } })
    : undefined;
  noisy?.stdout?.on("data", (b) => (out += b));
  const run = await new Run(runMs, startAt).begin();
  await Promise.all([run.steady("globex", "globex-portal", 20, 1000), run.steady("initech", "initech-portal", 20, 1000), noisy && once(noisy, "exit")]);
  if (noisy) {
    const acme = JSON.parse(out) as { hits: Hit[]; retryDelays: number[] };
    run.hits.push(...acme.hits);
    run.retryDelays.push(...acme.retryDelays);
  }
  await db.query(
    `INSERT INTO request_log SELECT $1, * FROM unnest($2::int[], $3::text[], $4::text[], $5::int[], $6::float8[])`,
    [name, run.hits.map((h) => Math.round(h.at)), run.hits.map((h) => h.tenant), run.hits.map((h) => h.client), run.hits.map((h) => h.status), run.hits.map((h) => h.ms)],
  );
  return run;
}

type Row = { client: string; sent: number; ok: number; limited: number; p50: number; p95: number };
function summarize(hits: Hit[]) {
  const rows: Row[] = [];
  for (const client of ["acme-batch", "acme-sync", "globex-portal", "initech-portal"]) {
    const h = hits.filter((x) => x.client === client);
    const ok = h.filter((x) => x.status === 200);
    rows.push({ client, sent: h.length, ok: ok.length, limited: h.filter((x) => x.status === 429).length, p50: pct(ok.map((x) => x.ms), 50), p95: pct(ok.map((x) => x.ms), 95) });
  }
  console.log(`   ${"client".padEnd(15)} ${"sent".padStart(6)} ${"200".padStart(6)} ${"429".padStart(6)} ${"429 %".padStart(6)} ${"p50 ms".padStart(7)} ${"p95 ms".padStart(7)}  (latency of the 200s, measured by the client)`);
  for (const r of rows) {
    console.log(`   ${r.client.padEnd(15)} ${String(r.sent).padStart(6)} ${String(r.ok).padStart(6)} ${String(r.limited).padStart(6)} ${((100 * r.limited) / Math.max(1, r.sent)).toFixed(1).padStart(6)} ${r.p50.toFixed(0).padStart(7)} ${r.p95.toFixed(0).padStart(7)}`);
  }
  const quiet = hits.filter((x) => x.tenant !== "acme" && x.status === 200).map((x) => x.ms);
  const quietP95 = pct(quiet, 95);
  console.log(`   quiet tenants (Globex + Initech): p95 ${quietP95.toFixed(0)} ms over ${quiet.length} requests`);
  return { rows, by: (c: string) => rows.find((r) => r.client === c)!, quietP95 };
}

function series(run: Run): Series {
  const seconds = Math.ceil(RUN_MS / 1000);
  const per = (tenant: string, f: (h: Hit) => boolean) => Array.from({ length: seconds }, (_, s) => run.hits.filter((h) => h.tenant === tenant && f(h) && h.at >= s * 1000 && h.at < (s + 1) * 1000).length);
  const p95 = (tenant: string) => Array.from({ length: seconds }, (_, s) => pctOrNaN(run.hits.filter((h) => h.tenant === tenant && h.status === 200 && h.at >= s * 1000 && h.at < (s + 1) * 1000).map((h) => h.ms), 95));
  return Object.fromEntries(TENANTS.map((t) => [t, { accepted: per(t, (h) => h.status === 200), limited: per(t, (h) => h.status === 429), p95: p95(t) }]));
}

async function main() {
  step("1. One bucket, many requests at once", "take_tokens() locks the bucket row, refills it by elapsed time and takes a token in one statement; a read-then-write in the app lets concurrent requests spend the same token");
  const wide = new pg.Pool({ connectionString: DATABASE_URL, max: 20 });
  await wide.query("INSERT INTO buckets VALUES ('demo:naive', 10, now()), ('demo:atomic', 10, now())");
  const naive = await Promise.all(
    Array.from({ length: 100 }, async () => {
      const { rows } = await wide.query("SELECT tokens FROM buckets WHERE key = 'demo:naive'");
      if (rows[0].tokens < 1) return false;
      await wide.query("UPDATE buckets SET tokens = $1 WHERE key = 'demo:naive'", [rows[0].tokens - 1]);
      return true;
    }),
  );
  const atomic = await Promise.all(
    Array.from({ length: 100 }, async () => (await wide.query("SELECT allowed FROM take_tokens('{demo:atomic}', '{10}', '{0.000001}')")).rows[0].allowed as boolean),
  );
  await wide.end();
  const n = naive.filter(Boolean).length;
  const a = atomic.filter(Boolean).length;
  console.log(`   bucket of 10 tokens, 100 concurrent requests: read-then-write admitted ${n}, take_tokens() admitted ${a}`);
  check("the row-locked function admits exactly the bucket size", a === 10);
  check("the unlocked read-then-write admits more than the bucket holds", n > 10);
  await db.query("TRUNCATE buckets");

  step("2. Baseline: the quiet tenants alone", "Globex's and Initech's portals at a steady 20 requests a second each, nobody else; this is the latency to protect");
  let server = await startServer("off");
  const base = await load("baseline", 4000, false);
  const sb = summarize(base.hits);

  step("3. Without limits: Acme's batch job floods the shared API", "48 workers of acme-batch plus 8 of acme-sync, against Globex's and Initech's portals at a steady 20 requests a second each (from second 1 to 11); one pool of 4 connections serves everyone");
  const off = await load("without limits", RUN_MS, true);
  await stopServer(server);
  const s0 = summarize(off.hits);

  step("4. The limiter's answers: headers on 200 and 429", "every response carries RateLimit-Policy (the quotas) and RateLimit (what is left, and when it is back); a 429 adds Retry-After and a problem+json body");
  server = await startServer("on");
  const first = await fetch(`http://localhost:${PORT}/members/3`, { headers: { "x-api-key": "acme-sync" } });
  console.log(`   GET /members/3 (acme-sync) -> ${first.status}`);
  for (const h of ["ratelimit-policy", "ratelimit"]) console.log(`     ${h}: ${first.headers.get(h)}`);
  const burstStart = performance.now();
  const burst = await Promise.all(Array.from({ length: 40 }, () => fetch(`http://localhost:${PORT}/members/3`, { headers: { "x-api-key": "acme-sync" } })));
  const burstMs = performance.now() - burstStart;
  const admitted = burst.filter((r) => r.status === 200).length;
  const refused = burst.find((r) => r.status === 429);
  console.log(`   40 requests at once from acme-sync: ${admitted} answered 200, ${burst.length - admitted} answered 429 (in ${burstMs.toFixed(0)} ms); one of the 429s:`);
  for (const h of ["retry-after", "ratelimit-policy", "ratelimit", "content-type"]) console.log(`     ${h}: ${refused?.headers.get(h)}`);
  console.log(`     body: ${await refused?.text()}`);
  await Promise.all([first, ...burst].filter((r) => r !== refused).map((r) => r.arrayBuffer()));
  check("the 429 carries Retry-After in whole seconds and both IETF headers", Number(refused?.headers.get("retry-after")) >= 1 && /"tenant";q=50;w=1, "key";q=30;w=1/.test(refused?.headers.get("ratelimit-policy") ?? "") && /"key";r=0;t=\d+/.test(refused?.headers.get("ratelimit") ?? ""));
  const most = 6 + Math.ceil((30 * burstMs) / 1000);
  check(`a burst gets what is left in the key's bucket and no more (at most the burst of 6 + 30/s x ${burstMs.toFixed(0)} ms = ${most})`, admitted >= 5 && admitted <= most);
  await sleep(1500);
  await db.query("TRUNCATE buckets");

  step("5. With limits: the same load", "Acme may use 50 requests a second (burst 10), each of its keys 30 (burst 6); Globex and Initech never come near theirs. The batch job keeps hammering, the sync job waits Retry-After plus jitter");
  const on = await load("with limits", RUN_MS, true);
  const stats = (await fetch(`http://localhost:${PORT}/stats`).then((r) => r.json())) as { served: number; refusedByDb: number; refusedLocally: number };
  await stopServer(server);
  const s1 = summarize(on.hits);
  console.log(`   server: ${stats.served} served, ${stats.refusedByDb} refused by take_tokens(), ${stats.refusedLocally} refused from the local memory of the last refusal`);

  step("6. What changed", "the limit moves the queue out of the shared pool and back to the client that caused it");
  console.log(`   quiet tenants' p95: ${sb.quietP95.toFixed(0)} ms alone, ${s0.quietP95.toFixed(0)} ms next to Acme without limits, ${s1.quietP95.toFixed(0)} ms with limits`);
  check("without limits the quiet tenants' p95 explodes (over 5x their baseline and over 100 ms)", s0.quietP95 > 5 * sb.quietP95 && s0.quietP95 > 100);
  check("with limits the quiet tenants stay close to their baseline (under 3x, and under a third of the unlimited run) and never see a 429", s1.quietP95 < 3 * sb.quietP95 && s1.quietP95 < s0.quietP95 / 3 && s1.by("globex-portal").limited === 0 && s1.by("initech-portal").limited === 0);
  const acmeOk = s1.by("acme-batch").ok + s1.by("acme-sync").ok;
  const secs = RUN_MS / 1000;  // Acme sends for the whole run
  console.log(`   Acme accepted ${acmeOk} in ${secs} s (limit 50/s + a burst of 10 = ${50 * secs + 10}); acme-batch ${s1.by("acme-batch").ok} (key limit 30/s + 6 = ${30 * secs + 6})`);
  check("Acme gets no more than its quota", acmeOk <= 50 * secs + 10 + 5 && s1.by("acme-batch").ok <= 30 * secs + 6 + 5);
  const share = (c: string) => s1.by(c).limited / s1.by(c).sent;
  console.log(`   acme-batch: ${(100 * share("acme-batch")).toFixed(1)}% of its requests got 429; acme-sync: ${(100 * share("acme-sync")).toFixed(1)}%`);
  check("the client that hammers keeps getting 429 (over 80% of what it sends, 2.5x the polite client's share)", share("acme-batch") > 0.8 && share("acme-batch") > 2.5 * share("acme-sync"));
  check("the client that honours Retry-After rarely sees one (under 50%) and still gets work done", share("acme-sync") < 0.5 && s1.by("acme-sync").ok > 50);
  const d = on.retryDelays;
  console.log(`   acme-sync waited ${d.length} times, ${Math.min(...d).toFixed(0)}..${Math.max(...d).toFixed(0)} ms (Retry-After 1 s plus up to 50% jitter)`);
  check("the polite client's retries are spread out, never earlier than Retry-After", d.length > 0 && Math.min(...d) >= 1000 && Math.max(...d) - Math.min(...d) > 200);
  check("most refusals never reach Postgres: the local memory of the last refusal answers them", stats.refusedLocally > stats.refusedByDb);

  step("7. Chart", "out/requests.svg: requests per second per tenant, accepted and 429, and the quiet tenants' p95, without and with limits");
  const svg = requestsChart([
    { title: "Without limits", data: series(off) },
    { title: "With limits (tenant 50/s, key 30/s)", data: series(on) },
  ], "out/requests.svg");
  console.log(`   wrote out/requests.svg (${svg.length} bytes)`);
  check("the chart was written", svg.includes("With limits"));
  await db.end();
}

await main();
