import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { type Point, curveChart } from "./chart.js";
import { POOL, PORT, SERVICE_MS, db } from "./db.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(label: string, cond: boolean) {
  console.log(`   ${cond ? "ok" : "FAILED"}: ${label}`);
  if (!cond) process.exitCode = 1;
}

const K6 = process.env.K6 ?? ".bin/k6";
const CAPACITY = POOL / (SERVICE_MS / 1000);
const SLO_MS = 300;
type Metrics = { rssMb: number; heapMb: number; pool: { total: number; idle: number; waiting: number }; inflight: number; served: number; errors: number; abandoned: number };
const metrics = async () => (await fetch(`http://localhost:${PORT}/metrics`).then((r) => r.json())) as Metrics;

// k6 as a child process; its compact summary goes to the log, the full one to out/k6/<name>.json
async function k6(script: string, name: string, env: Record<string, string> = {}) {
  console.log(`   $ k6 run k6/${script}`);
  const args = ["run", "--quiet", "--no-color", "-e", `SUMMARY=out/k6/${name}.json`, ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]), `k6/${script}`];
  const child = spawn(K6, args, { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (b) => process.stdout.write(b));
  // k6 logs "Insufficient VUs" warnings on stderr many times during the ramp; keep the first one of each kind
  const seen = new Set<string>();
  child.stderr.on("data", (b: Buffer) => {
    for (const line of b.toString().split("\n").filter(Boolean)) {
      const kind = (line.match(/msg="([^"]+)"/)?.[1] ?? line).replace(/scenario=\S+/, "");
      if (!seen.has(kind)) process.stdout.write(`     (k6) ${line.replace(/^time="[^"]+" /, "")}\n`);
      seen.add(kind);
    }
  });
  const [code] = (await once(child, "exit")) as [number];
  console.log(`   k6 exit code ${code}${code === 99 ? " (thresholds crossed: the gate fails the pipeline)" : ""}`);
  const summary = JSON.parse(readFileSync(`out/k6/${name}.json`, "utf8"));
  return { code, m: summary.metrics as Record<string, { values: Record<string, number> }> };
}

async function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], { stdio: "inherit" });
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`http://localhost:${PORT}/health`);
      return child;
    } catch {
      await sleep(100);
    }
  }
  throw new Error("server did not start");
}

async function plan(sql: string) {
  const r = await db.query(`EXPLAIN (ANALYZE, COSTS OFF, TIMING ON) ${sql}`);
  return r.rows.map((x) => x["QUERY PLAN"] as string).filter((l) => /Scan|Execution Time/.test(l));
}

async function main() {
  mkdirSync("out/k6", { recursive: true });
  const version = spawnSync(K6, ["version"], { encoding: "utf8" }).stdout.trim();
  console.log(`   ${version}`);
  const server = await startServer();

  step("1. Smoke: does it work at all?", "one virtual user for 3 s against every endpoint; checks status and content, not speed. Run before any load, so a broken build is not mistaken for a slow one");
  const smoke = await k6("smoke.js", "smoke");
  check("smoke passes: every check true, no errors", smoke.code === 0);
  const searchMed = smoke.m["http_req_duration{name:GET /members?email}"].values.med;
  const idMed = smoke.m["http_req_duration{name:GET /members/:id}"].values.med;
  console.log(`   already visible at one user: search by email ${searchMed.toFixed(0)} ms median against ${idMed.toFixed(1)} ms for a lookup by id`);

  step("2. SLO gate on the member search, before the fix", "60 searches a second for 8 s (an open model: arrivals do not wait for answers), judged by p95 < 300 ms and errors < 1%");
  for (const l of await plan("SELECT id FROM members WHERE lower(email) = lower('MEMBER.4242@globex.example')")) console.log(`   plan: ${l.trim()}`);
  const before = await k6("gate.js", "gate-before");
  const p95Before = before.m.http_req_duration.values["p(95)"];
  check("the gate FAILS on the slow endpoint (k6 exits 99, p95 over 300 ms)", before.code === 99 && p95Before > SLO_MS);
  const t0 = Date.now();
  while ((await metrics()).inflight > 1) await sleep(100);
  const m = await metrics();
  console.log(`   after k6 stopped: ${m.abandoned} queued searches dropped because their client had gone, the rest finished in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  step("3. The fix: an index on lower(email)", "the query compares lower(email), so a plain index on email would not help; an expression index on lower(email) turns the full scan into an index lookup");
  const ix = Date.now();
  await db.query("CREATE INDEX members_lower_email ON members (lower(email))");
  console.log(`   CREATE INDEX members_lower_email ON members (lower(email)) -- ${Date.now() - ix} ms`);
  for (const l of await plan("SELECT id FROM members WHERE lower(email) = lower('MEMBER.4242@globex.example')")) console.log(`   plan: ${l.trim()}`);
  const after = await k6("gate.js", "gate-after");
  const p95After = after.m.http_req_duration.values["p(95)"];
  check("the same gate PASSES after the fix (k6 exits 0, p95 under 300 ms)", after.code === 0 && p95After < SLO_MS);
  console.log(`   search p95: ${p95Before.toFixed(0)} ms before, ${p95After.toFixed(1)} ms after`);

  step("4. Ramp: find the saturation point", `more statements a second at each 4 s step. Little's law (L = X x W): ${POOL} connections, each held ${SERVICE_MS} ms, serve at most ${POOL} / ${SERVICE_MS / 1000} s = ${CAPACITY} a second`);
  const samples: { t: number; inflight: number }[] = [];
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      samples.push({ t: Date.now(), inflight: (await metrics()).inflight - 1 });
      await sleep(100);
    }
  })();
  const ramp = await k6("ramp.js", "ramp");
  sampling = false;
  await sampler;
  const steps = [25, 50, 75, 100, 125, 150, 175];
  const points: Point[] = steps.map((rate) => {
    const d = ramp.m[`http_req_duration{scenario:r${rate}}`].values;
    return { offered: rate, achieved: ramp.m[`http_reqs{scenario:r${rate}}`].values.count / 4, p50: d.med, p95: d["p(95)"], dropped: ramp.m[`dropped_iterations{scenario:r${rate}}`]?.values.count ?? 0, avg: d.avg };
  });
  // the server's own count of requests in flight, averaged over the middle of each step (k6 starts the first step when the first request lands)
  const start = samples.find((s) => s.inflight > 0)?.t ?? samples[0].t;
  const measuredL = steps.map((_, i) => {
    const inside = samples.filter((s) => s.t >= start + i * 4000 + 1000 && s.t < start + (i + 1) * 4000 - 500);
    return inside.reduce((a, s) => a + s.inflight, 0) / Math.max(1, inside.length);
  });
  console.log(`   ${"offered".padStart(8)} ${"served".padStart(7)} ${"p50 ms".padStart(7)} ${"p95 ms".padStart(7)} ${"dropped".padStart(8)}  ${"L = X x W".padStart(10)} ${"in flight".padStart(10)}`);
  points.forEach((p, i) => {
    const littleL = (p.achieved * p.avg) / 1000;
    console.log(`   ${String(p.offered).padStart(8)} ${p.achieved.toFixed(0).padStart(7)} ${p.p50.toFixed(1).padStart(7)} ${p.p95.toFixed(1).padStart(7)} ${String(p.dropped).padStart(8)}  ${littleL.toFixed(1).padStart(10)} ${measuredL[i].toFixed(1).padStart(10)}`);
  });
  const steady = points.map((p, i) => ({ p, i })).filter(({ p }) => p.dropped === 0);
  check("Little's law holds: below saturation, served x mean latency matches the requests the server counted in flight", steady.length >= 2 && steady.every(({ p, i }) => Math.abs((p.achieved * p.avg) / 1000 - measuredL[i]) <= Math.max(0.6, 0.25 * measuredL[i])));
  const first = points[0];
  const top = points[points.length - 1];
  const peak = Math.max(...points.map((p) => p.achieved));
  const knee = points.find((p) => p.p95 > SLO_MS);
  console.log(`   peak served ${peak.toFixed(0)}/s (Little's law: ${CAPACITY}/s); p95 crosses ${SLO_MS} ms at ${knee ? `${knee.offered}/s offered` : "no step"}`);
  check("below capacity the API serves what it is offered", Math.abs(first.achieved - first.offered) / first.offered < 0.1);
  check("past capacity throughput stops growing, near the Little's law limit", top.achieved < 0.85 * top.offered && peak > 0.7 * CAPACITY && peak < 1.15 * CAPACITY);
  check("past capacity latency bends up: p95 at the top step over 5x the first step's", top.p95 > 5 * first.p95);

  step("5. Soak: hold a realistic mix and look for drift", "100 requests a second (60% profile, 30% statement, 10% search) for 30 s in three 10 s windows; memory and pool sampled from /metrics every 2 s");
  const mem: Metrics[] = [];
  sampling = true;
  const memSampler = (async () => {
    while (sampling) {
      mem.push(await metrics());
      await sleep(2000);
    }
  })();
  const soak = await k6("soak.js", "soak");
  sampling = false;
  await memSampler;
  const windows = [1, 2, 3].map((w) => ({ w, p95: soak.m[`http_req_duration{scenario:w${w}}`].values["p(95)"], n: soak.m[`http_reqs{scenario:w${w}}`].values.count }));
  for (const w of windows) console.log(`   window ${w.w}: ${w.n} requests, p95 ${w.p95.toFixed(1)} ms`);
  console.log(`   server RSS ${mem.map((m) => m.rssMb.toFixed(0)).join(" ")} MB; pool connections ${mem.map((m) => m.pool.total).join(" ")}; errors ${mem.at(-1)!.errors}`);
  check("the soak meets the SLO (k6 exits 0)", soak.code === 0);
  check("no latency drift: the last window's p95 is within 2x the first's (+20 ms)", windows[2].p95 < 2 * windows[0].p95 + 20);
  check(`no leak: RSS grows less than 50 MB, the pool never exceeds its ${POOL} connections, no 5xx`, mem.at(-1)!.rssMb - mem[0].rssMb < 50 && mem.every((m) => m.pool.total <= POOL) && mem.at(-1)!.errors === 0);

  step("6. Throughput/latency curve", "out/throughput-latency.svg from the ramp: served against offered, and latency against served; the bend sits at the Little's law capacity");
  const svg = curveChart(points, CAPACITY, SLO_MS, "out/throughput-latency.svg");
  console.log(`   wrote out/throughput-latency.svg (${svg.length} bytes)`);
  check("the chart was written", svg.includes("Little's law"));

  server.kill("SIGTERM");
  await once(server, "exit");
  await db.end();
}

await main();
