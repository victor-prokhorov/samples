// The story: an incident nobody can trace, then the same incident with traces, logs and RED metrics joined by one id.
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { collector, type RedRow, type Span } from "./collector.js";
import { API_PORT, SLO_MS, WEB_PORT } from "./config.js";
import { JOINERS, MEMBERS } from "./data.js";
import { waterfall, type LogLine } from "./waterfall.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

mkdirSync("out/logs", { recursive: true });
const col = collector();
const collectorPort = await col.listen();

type Phase = "before" | "after";
function start(service: "api" | "web", phase: Phase): ChildProcess {
  const out = openSync(`out/logs/${service}-${phase}.jsonl`, "w");
  return spawn(process.execPath, ["--import", "tsx", "--import", "./src/telemetry.ts", `src/${service}.ts`], {
    stdio: ["ignore", out, "inherit"],
    env: {
      ...process.env,
      OTEL_SERVICE_NAME: service,
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://localhost:${collectorPort}`,
      REPORT_QUERY: phase === "before" ? "n+1" : "join",
    },
  });
}

async function up(port: number) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/health`)).ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`nothing on :${port}`);
}

async function stop(...children: ChildProcess[]) {
  for (const c of children) c.kill("SIGTERM");
  const codes = await Promise.all(children.map(async (c) => (await once(c, "exit"))[0]));
  check(codes.every((c) => c === 0), "both processes flushed their last spans and metric points and exited cleanly");
}

// The same 130 requests in both phases: per round, the three employer dashboards, six member pages and
// four statements, one of which (in rounds 2 and 4) belongs to a member who joined this month (a 500).
const ROUNDS = 10;
async function traffic() {
  const statuses = new Map<number, number>();
  for (let round = 1; round <= ROUNDS; round++) {
    const paths = [
      ...["acme", "globex", "initech"].map((e) => `/employers/${e}/dashboard`),
      ...[0, 1, 2, 3, 4, 5].map((k) => `/members/${1 + ((round * 97 + k * 61) % (MEMBERS - 3))}`),
      ...[0, 1, 2].map((k) => `/members/${1 + ((round * 53 + k * 89) % (MEMBERS - 3))}/statement`),
      round === 2 || round === 4 ? `/members/${JOINERS[round / 2 - 1]}/statement` : `/members/${10 + round}/statement`,
    ];
    for (const p of paths) {
      const r = await fetch(`http://localhost:${WEB_PORT}${p}`);
      await r.arrayBuffer();
      statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1);
    }
  }
  return [...statuses.entries()].sort().map(([s, n]) => `${n} x ${s}`).join(", ");
}

async function phase(p: Phase) {
  const api = start("api", p);
  const web = start("web", p);
  await Promise.all([up(API_PORT), up(WEB_PORT)]);
  // Warm-up, as a readiness check would do before a load balancer sends traffic: one request per route
  // (the first one pays for module loading, JIT and the first database connection). Then wait two metric
  // export intervals, so their delta points have arrived, and start counting from zero.
  for (const path of ["/employers/acme/dashboard", "/members/1", "/members/1/statement"]) await (await fetch(`http://localhost:${WEB_PORT}${path}`)).arrayBuffer();
  await sleep(2200);
  col.clearMetrics();
  const started = Date.now();
  const summary = await traffic();
  console.log(`   ${ROUNDS * 13} requests through web :${WEB_PORT} -> api :${API_PORT} -> postgres :55466 in ${Date.now() - started} ms: ${summary}`);
  await stop(web, api);
  return { red: col.red(SLO_MS), logs: readLogs(p) };
}

function readLogs(p: Phase): LogLine[] {
  return ["web", "api"].flatMap((s) =>
    readFileSync(`out/logs/${s}-${p}.jsonl`, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as LogLine),
  );
}

function printRed(rows: RedRow[]) {
  console.log(`   ${"service".padEnd(8)}${"route".padEnd(34)}${"requests".padStart(9)}${"rate/s".padStart(8)}${"errors".padStart(8)}  ${"p50".padEnd(14)}${"p95".padEnd(14)}within ${SLO_MS} ms`);
  for (const r of rows)
    console.log(
      `   ${r.service.padEnd(8)}${r.route.padEnd(34)}${String(r.requests).padStart(9)}${r.ratePerSec.toFixed(1).padStart(8)}${String(r.errors).padStart(8)}  ${r.p50.padEnd(14)}${r.p95.padEnd(14)}${r.withinSlo} of ${r.requests} (${((100 * r.withinSlo) / r.requests).toFixed(0)}%)`,
    );
}

const row = (rows: RedRow[], service: string, route: string) => rows.find((r) => r.service === service && r.route === route)!;
const verdict = (r: RedRow) =>
  `${r.route}: ${r.withinSlo} of ${r.requests} within ${SLO_MS} ms (${((100 * r.withinSlo) / r.requests).toFixed(0)}%), objective 95%: ${r.withinSlo / r.requests >= 0.95 ? "met" : "MISSED"}`;
const short = (l: LogLine) => JSON.stringify(l);
const dbSpans = (spans: Span[]) => spans.filter((s) => s.attributes["db.system.name"]);

async function fetchTrace(id: string): Promise<Span[]> {
  // Over HTTP, the way a UI or a teammate would ask the collector.
  return (await (await fetch(`http://localhost:${collectorPort}/api/traces/${id}`)).json()) as Span[];
}

function postgresLines(traceId: string) {
  const all = execFileSync("docker", ["compose", "logs", "--no-log-prefix", "postgres"], { maxBuffer: 256 * 1024 * 1024 }).toString().split("\n");
  return all.filter((l) => l.includes(`traceparent='00-${traceId}-`) && l.includes(" execute "));
}

function render(name: string, spans: Span[], logs: LogLine[], title: string, note: string, scaleMs?: number) {
  const id = spans[0].traceId;
  writeFileSync(`out/${name}.json`, "[\n" + spans.map((s) => JSON.stringify(s)).join(",\n") + "\n]\n");
  writeFileSync(`out/${name}.html`, waterfall(spans, logs.filter((l) => l.trace_id === id), { title, note, scaleMs }));
  console.log(`   wrote out/${name}.html (waterfall) and out/${name}.json (the ${spans.length} spans as the collector stored them)`);
}

// ---------------------------------------------------------------------------------------------------------

step(
  "1. The incident: members say the employer dashboard is slow",
  "three processes (web BFF, API, Postgres) plus a collector; every process exports spans and metrics over OTLP/HTTP and writes JSON logs",
);
console.log(`   collector on :${collectorPort} (OTLP/HTTP JSON: POST /v1/traces, POST /v1/metrics; GET /api/traces/<id>, GET /api/red)`);
const before = await phase("before");

step(
  "2. RED per route: which route, how bad, against which objective",
  `Rate, Errors, Duration from the HTTP instrumentation's http.server.request.duration histogram, labelled by http.route; the objective is 29-kpis' latency SLO: 95% of requests within ${SLO_MS} ms`,
);
printRed(before.red);
const dashBefore = row(before.red, "web", "GET /employers/:code/dashboard");
const stmtBefore = row(before.red, "web", "GET /members/:id/statement");
console.log(`   ${verdict(dashBefore)}`);
console.log(`   statement: ${stmtBefore.errors} of ${stmtBefore.requests} failed (web answers 502 when the API answers 500)`);
check(dashBefore.requests === ROUNDS * 3 && dashBefore.withinSlo / dashBefore.requests < 0.95, "the dashboard route misses the 95%-within-300-ms objective");
const members = row(before.red, "web", "GET /members/:id");
check(members.requests === ROUNDS * 6 && members.withinSlo / members.requests >= 0.95, "member pages meet the objective: the problem is one route, not the service");
check(stmtBefore.errors === 2 && row(before.red, "api", "GET /api/members/:id/statement").errors === 2, "RED counts the 2 statement failures in both processes");

step(
  "3. From one log line to the whole trace",
  "the pino instrumentation puts trace_id and span_id in every line logged inside a span; the trace id is the join key between logs, spans and the database log",
);
const inRequest = before.logs.filter((l) => !String(l.msg).endsWith("listening"));
const correlated = inRequest.filter((l) => /^[0-9a-f]{32}$/.test(String(l.trace_id)) && /^[0-9a-f]{16}$/.test(String(l.span_id)));
console.log(`   ${correlated.length} of ${inRequest.length} log lines written while serving a request carry trace_id and span_id (web and api)`);
check(inRequest.length > 0 && correlated.length === inRequest.length, "every log line written inside a request carries the trace id and span id");
const slow = before.logs.filter((l) => l.service === "web" && l.msg === "slow request").sort((a, b) => Number(b.duration_ms) - Number(a.duration_ms));
console.log(`   web log, ${slow.length} "slow request" warnings; the slowest:`);
console.log(`   ${short(slow[0])}`);
const traceId = String(slow[0].trace_id);
const apiLines = before.logs.filter((l) => l.service === "api" && l.trace_id === traceId);
console.log(`   api log, grep ${traceId}:`);
for (const l of apiLines) console.log(`   ${short(l)}`);
check(apiLines.length >= 2 && apiLines.every((l) => l.span_id !== slow[0].span_id), "the API logged under the same trace id, in its own span: the traceparent header crossed the process boundary");
const pgLines = postgresLines(traceId);
console.log(`   postgres log, grep ${traceId}: ${pgLines.length} statements, e.g.`);
console.log(`   ${pgLines[2]?.trim()}`);

const spans = await fetchTrace(traceId);
const webServer = spans.find((s) => s.service === "web" && s.kind === "SERVER")!;
const webClient = spans.find((s) => s.service === "web" && s.kind === "CLIENT")!;
const apiServer = spans.find((s) => s.service === "api" && s.kind === "SERVER")!;
const queries = dbSpans(spans);
console.log(`   collector, GET /api/traces/${traceId}: ${spans.length} spans`);
console.log(`     web  SERVER ${webServer.name}  ${webServer.durationMs.toFixed(1)} ms`);
console.log(`     web  CLIENT ${webClient.name} ${webClient.attributes["url.path"]}  parent = web SERVER: ${webClient.parentSpanId === webServer.spanId}`);
console.log(`     api  SERVER ${apiServer.name}  ${apiServer.durationMs.toFixed(1)} ms  parent = web CLIENT: ${apiServer.parentSpanId === webClient.spanId}`);
console.log(`     api  CLIENT pg.query x ${queries.length}, all children of the api SERVER span: ${queries.every((q) => q.parentSpanId === apiServer.spanId)}`);
check(webClient.parentSpanId === webServer.spanId && apiServer.parentSpanId === webClient.spanId, "web -> API: one trace, the API's server span is a child of the web's client span (W3C traceparent)");
check(queries.length > 0 && queries.every((q) => q.parentSpanId === apiServer.spanId), "API -> Postgres: every query is a child span of the API request");
check(pgLines.length === queries.length, "Postgres logged every one of those queries with the same trace id (sqlcommenter traceparent comment)");

step(
  "4. Read the waterfall: an N+1",
  "a waterfall puts every span on one time axis; a comb of identical short queries, one after another, is an N+1: one query for a list, then one per item",
);
const perQuery = new Map<string, Span[]>();
for (const q of queries) perQuery.set(String(q.attributes["db.query.text"]), [...(perQuery.get(String(q.attributes["db.query.text"])) ?? []), q]);
const [nPlusOneSql, nPlusOne] = [...perQuery.entries()].sort((a, b) => b[1].length - a[1].length)[0];
const inDb = queries.reduce((s, q) => s + q.durationMs, 0);
console.log(`   ${queries.length} queries; the most repeated, ${nPlusOne.length} times: ${nPlusOneSql}`);
const median = nPlusOne.map((q) => q.durationMs).sort((a, b) => a - b)[Math.floor(nPlusOne.length / 2)];
const executeMs = pgLines.reduce((s, l) => s + Number(/duration: ([\d.]+) ms/.exec(l)?.[1] ?? 0), 0);
console.log(`   the API span lasts ${apiServer.durationMs.toFixed(0)} ms; its query spans add up to ${inDb.toFixed(0)} ms, median ${median.toFixed(2)} ms each`);
console.log(`   Postgres' own log says executing all ${pgLines.length} took ${executeMs.toFixed(0)} ms: the rest is ${nPlusOne.length} round trips, one after another`);
check(nPlusOne.length >= 100 && median < 5 && executeMs * 4 < inDb, "the slow request is hundreds of fast queries, not one slow query: the time goes in round trips");
render("trace-before", spans, before.logs, "Before: GET /employers/acme/dashboard (N+1)", `Found from the slowest "slow request" warning in out/logs/web-before.jsonl. ${nPlusOne.length} identical queries, one per member, run one after another.`);

step(
  "5. The fix, and the new waterfall",
  "one query with a join and GROUP BY replaces the loop; the same traffic again, the same three signals compared",
);
const after = await phase("after");
printRed(after.red);
const dashAfter = row(after.red, "web", "GET /employers/:code/dashboard");
console.log(`   ${verdict(dashAfter)}`);
check(dashAfter.requests === ROUNDS * 3 && dashAfter.withinSlo / dashAfter.requests >= 0.95, "after the fix the dashboard meets the objective: at least 95% of its requests within 300 ms");
const acmeAfter = after.logs
  .filter((l) => l.service === "web" && l.path === "/employers/acme/dashboard")
  .sort((a, b) => Number(b.duration_ms) - Number(a.duration_ms))[0];
console.log(`   slowest Acme dashboard after the fix: ${short(acmeAfter)}`);
const spansAfter = await fetchTrace(String(acmeAfter.trace_id));
const queriesAfter = dbSpans(spansAfter);
const rootAfter = spansAfter.find((s) => !s.parentSpanId)!;
console.log(`   trace ${acmeAfter.trace_id}: ${spansAfter.length} spans, ${queriesAfter.length} queries, ${rootAfter.durationMs.toFixed(1)} ms (before: ${spans.length} spans, ${queries.length} queries, ${webServer.durationMs.toFixed(1)} ms)`);
check(queriesAfter.length === 2 && queries.length === nPlusOne.length + 2, `the dashboard went from ${queries.length} queries to 2 (employer lookup, one join)`);
const acmeMedian = (logs: LogLine[]) =>
  logs.filter((l) => l.service === "web" && l.path === "/employers/acme/dashboard").map((l) => Number(l.duration_ms)).sort((a, b) => a - b)[Math.floor(ROUNDS / 2)];
console.log(`   Acme dashboard, median of ${ROUNDS} requests: ${acmeMedian(before.logs)} ms before, ${acmeMedian(after.logs)} ms after (web log duration_ms)`);
check(acmeMedian(after.logs) * 5 < acmeMedian(before.logs) && rootAfter.durationMs < webServer.durationMs, "the Acme dashboard is more than 5 times faster (median), and its slowest request is faster than the slowest before");
check(after.logs.filter((l) => l.msg === "slow request").length === 0, "no slow request warnings after the fix");
render("trace-after", spansAfter, after.logs, "After: GET /employers/acme/dashboard (one join)", `The same request after the fix, drawn on the before trace's ${Math.round(webServer.durationMs)} ms axis: the comb of per-member queries is gone, one query does the join and the sums.`, webServer.durationMs);

step(
  "6. An error, traced the same way",
  "RED counted 2 errors on the statement route; the error log line's trace id leads to the span that threw, with the exception recorded on it",
);
const failed = after.logs.find((l) => l.service === "web" && l.msg === "request failed")!;
console.log(`   ${short(failed)}`);
const errSpans = await fetchTrace(String(failed.trace_id));
const thrower = errSpans.find((s) => s.status === "ERROR" && s.service === "api")!;
const exception = thrower.events.find((e) => e.name === "exception")!;
console.log(`   span ${thrower.service} ${thrower.name} status ${thrower.status}, event exception: ${exception.attributes["exception.type"]}: ${exception.attributes["exception.message"]}`);
check(exception !== undefined && String(exception.attributes["exception.message"]).includes("period"), "the failing span carries the exception that explains the 500");
check(row(after.red, "web", "GET /members/:id/statement").errors === 2, "the statement bug is not fixed yet: RED still counts its 2 errors, and the trace says where it is");
render("trace-error", errSpans, after.logs, "Error: GET /members/:id/statement (502)", "A member who joined this month has no contribution yet; the API reads the last row of an empty list and throws.");

writeFileSync("out/red.json", JSON.stringify({ sloMs: SLO_MS, before: before.red, after: after.red }, null, 2) + "\n");
console.log(`\n   wrote out/red.json; ${col.spans.length} spans stored by the collector in .collector/spans.jsonl`);
await col.close();
