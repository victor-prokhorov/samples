import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { PORT, db } from "./db.js";
import { type Kpi, SLO, kpis, validate } from "./kpis.js";
import { compute, daily, funnel, latency, printTable, writeDashboard } from "./report.js";
import { INCIDENT, WINDOW, simulate } from "./simulate.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

const range = [WINDOW.from, WINDOW.to];
const one = async (sql: string, params: unknown[] = range) => (await db.query(sql, params)).rows[0];

async function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], { stdio: "inherit", env: { ...process.env, FAULT_WINDOW: INCIDENT } });
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`http://localhost:${PORT}/health`);
      return child;
    } catch {
      await sleep(100);
    }
  }
  throw new Error("portal did not start");
}

async function main() {
  step("1. The app emits what happened", "the portal writes a usage event per member action (events) and a row per HTTP request (request_log); KPIs are SQL over those two tables, nothing is counted by hand");
  const server = await startServer();
  const started = Date.now();
  const sim = await simulate();
  server.kill();
  console.log(`   simulated ${WINDOW.from.toISOString().slice(0, 10)} .. ${WINDOW.to.toISOString().slice(0, 10)}: ${sim.visits} member visits, ${sim.probes} hourly health probes, ${sim.requests} change requests (${sim.resolved} resolved by staff); incident ${INCIDENT}; took ${Date.now() - started}ms`);
  const counts = await db.query("SELECT name, count(*)::int AS n FROM events GROUP BY name ORDER BY n DESC");
  console.log(`   events: ${counts.rows.map((r) => `${r.name}=${r.n}`).join(", ")}`);
  check(sim.visits > 300 && sim.requests > 50, "enough traffic to measure");

  step("2. A vanity count versus adoption", "\"logins this month\" only goes up; adoption divides distinct eligible members who logged in by all eligible members, so it says who is NOT using the portal");
  const logins = await one("SELECT count(*)::int AS n FROM events WHERE name = 'login' AND at >= $1 AND at < $2");
  const adoption = (await compute()).find((r) => r.kpi.id === "adoption")!;
  console.log(`   logins in the window: ${logins.n} (sounds like success)`);
  console.log(`   adoption: ${adoption.value.toFixed(1)}% (${adoption.detail}), target >= ${adoption.kpi.target.value}%`);
  const byEmployer = await db.query(
    `SELECT e.name AS employer, count(DISTINCT ev.member_id)::int AS active, count(DISTINCT m.id)::int AS eligible
     FROM employers e JOIN members m ON m.employer_id = e.id AND m.eligible
     LEFT JOIN events ev ON ev.member_id = m.id AND ev.name = 'login' AND ev.at >= $1 AND ev.at < $2
     GROUP BY e.name ORDER BY e.name`,
    range,
  );
  for (const r of byEmployer.rows) console.log(`   ${r.employer.padEnd(8)} ${r.active}/${r.eligible} eligible members active (${((100 * r.active) / r.eligible).toFixed(0)}%)`);
  check(logins.n > 500 && adoption.value < adoption.kpi.target.value, "a big login count hides an adoption below target");

  step("3. A mean versus the p95", "a mean blends the many fast requests with the few slow ones; the 95th percentile is what the slowest one in twenty members waits");
  for (const l of await latency()) console.log(`   ${l.route.padEnd(22)} ${String(l.requests).padStart(5)} requests  mean ${String(l.mean).padStart(4)} ms  p95 ${String(l.p95).padStart(4)} ms`);
  const contributions = (await latency()).find((l) => l.route === "GET /contributions")!;
  const slow = await one("SELECT count(*)::int AS n, round(avg(service_years))::int AS years FROM members WHERE service_years > 30", []);
  const overall = await one(`SELECT round(avg(duration_ms))::int AS mean, round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS p95
    FROM request_log WHERE at >= $1 AND at < $2 AND route NOT IN ('/health', '/staff/changes/:id/resolve')`);
  console.log(`   all member routes together: mean ${overall.mean} ms, p95 ${overall.p95} ms (the fast pages drown the slow one, so the KPI takes the slowest route)`);
  console.log(`   the slow tail: ${slow.n} members with more than 30 years of service, whose history query is slow`);
  check(contributions.mean < 150 && contributions.p95 > 300 && overall.p95 < 300, "the mean, and the p95 of all routes together, look fine while one route's p95 misses 300 ms");

  step("4. A health check versus what members got", "a probe on /health that never touches the database says 100% up; availability counts the member requests that actually failed, and the SLO turns the shortfall into an error budget");
  const probes = await one("SELECT count(*)::int AS n, 100.0 * count(*) FILTER (WHERE status = 200) / count(*) AS up FROM request_log WHERE route = '/health' AND at >= $1 AND at < $2");
  const results = await compute();
  const availability = results.find((r) => r.kpi.id === "availability")!;
  const budget = results.find((r) => r.kpi.id === "error_budget")!;
  console.log(`   health probes: ${probes.n}, ${Number(probes.up).toFixed(1)}% answered 200`);
  console.log(`   availability:  ${availability.value.toFixed(2)}% (${availability.detail}), SLO ${SLO}%`);
  console.log(`   error budget:  ${budget.detail}, remaining ${budget.value.toFixed(0)}%`);
  for (const d of (await daily()).filter((d) => d.failed > 0)) console.log(`   ${d.day}: ${d.failed} of ${d.requests} member requests failed (burn rate ${(d.failed / d.requests / (1 - SLO / 100)).toFixed(1)}x the budget rate)`);
  check(Number(probes.up) === 100 && availability.value < SLO && budget.value < 0, "probes say 100% while member requests miss the SLO and the budget is spent");

  step("5. Change request funnel", "each step counts sessions that reached it; the drop between steps shows where members give up (validation errors, the outage, abandoning the form)");
  const f = await funnel();
  for (const [i, s] of f.entries()) {
    const drop = i ? ` (-${(100 - (100 * s.sessions) / f[i - 1].sessions).toFixed(0)}% from ${f[i - 1].step})` : "";
    console.log(`   ${s.step.padEnd(18)} ${String(s.sessions).padStart(5)}${drop}`);
  }
  const rejected = await one("SELECT count(DISTINCT session_id)::int AS n FROM events WHERE name = 'change_rejected' AND at >= $1 AND at < $2");
  console.log(`   ${rejected.n} sessions hit a validation error at least once`);
  check(f[2].sessions > f[3].sessions && rejected.n > 0, "the funnel loses sessions between opening and submitting the form");

  step("6. Every KPI has a definition, an owner and a target", "kpis.ts is the one place a KPI is defined; validate() rejects a KPI nobody owns or that has no target, before a number reaches a dashboard");
  const draft: Partial<Kpi>[] = [...kpis, { id: "logins", name: "Logins", formula: "count of login events", unit: "%", sql: "SELECT count(*) AS value FROM events" }];
  const errors = validate(draft);
  for (const e of errors) console.log(`   rejected: ${e}`);
  check(errors.length === 3 && errors.every((e) => e.startsWith("logins:")), "the draft KPI is rejected for its missing question, owner and target");
  check(validate(kpis).length === 0, "the real definitions are complete");
  console.log(`   ${kpis.length} definitions valid`);

  step("7. The KPI report", "each value is the definition's SQL run over the window, compared with its target; a missed target names the owner who acts on it");
  printTable(results);
  check(results.length === kpis.length && results.some((r) => r.met) && results.some((r) => !r.met), "the report has met and missed KPIs");

  step("8. Static dashboard", "one self-contained HTML file: no script, no external library, inline SVG bars, status as text and icon (not colour alone), definitions table under the charts");
  const html = await writeDashboard("out/dashboard.html");
  const bars = (html.match(/<rect /g) ?? []).length;
  console.log(`   wrote out/dashboard.html: ${html.length} bytes, ${bars} bars, ${(html.match(/class="tile"/g) ?? []).length} KPI tiles, external references: ${(html.match(/(src|href)="http/g) ?? []).length}`);
  check(!/<script/.test(html) && !/(src|href)="http/.test(html) && bars > 28, "dashboard is static and self-contained");
  await db.end();
}

await main();
