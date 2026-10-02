import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { db } from "./db.js";
import { dashboard } from "./dashboard.js";
import { type Kpi, fmt, kpis, meets } from "./kpis.js";
import { WINDOW } from "./simulate.js";

export type Result = { kpi: Kpi; value: number; detail: string; met: boolean };
export type FunnelStep = { step: string; sessions: number };
export type Day = { day: string; requests: number; failed: number };
export type RouteLatency = { route: string; requests: number; mean: number; p95: number };

const range = [WINDOW.from, WINDOW.to];

export async function compute(): Promise<Result[]> {
  const out: Result[] = [];
  for (const kpi of kpis) {
    const { rows } = await db.query(kpi.sql, range);
    const value = Number(rows[0].value);
    out.push({ kpi, value, detail: rows[0].detail, met: meets(kpi, value) });
  }
  return out;
}

export async function funnel(): Promise<FunnelStep[]> {
  const { rows } = await db.query(
    `SELECT s.step, count(DISTINCT e.session_id)::int AS sessions
     FROM unnest(array['login', 'view_profile', 'change_started', 'change_submitted']) WITH ORDINALITY AS s(step, n)
     LEFT JOIN events e ON e.name = s.step AND e.at >= $1 AND e.at < $2
     GROUP BY s.step, s.n ORDER BY s.n`,
    range,
  );
  return rows;
}

export async function daily(): Promise<Day[]> {
  const { rows } = await db.query(
    `SELECT to_char(d, 'MM-DD') AS day, count(r.id)::int AS requests, count(r.id) FILTER (WHERE r.status >= 500)::int AS failed
     FROM generate_series($1::timestamptz, $2::timestamptz - interval '1 day', interval '1 day') d
     LEFT JOIN request_log r ON r.at >= d AND r.at < d + interval '1 day' AND r.route NOT IN ('/health', '/staff/changes/:id/resolve')
     GROUP BY d ORDER BY d`,
    range,
  );
  return rows;
}

export async function latency(): Promise<RouteLatency[]> {
  const { rows } = await db.query(
    `SELECT method || ' ' || route AS route, count(*)::int AS requests, round(avg(duration_ms))::int AS mean,
            round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS p95
     FROM request_log WHERE at >= $1 AND at < $2 AND route NOT IN ('/health', '/staff/changes/:id/resolve')
     GROUP BY 1 ORDER BY p95 DESC`,
    range,
  );
  return rows;
}

export function printTable(results: Result[]) {
  const line = (cols: string[]) => console.log(`   ${cols[0].padEnd(42)} ${cols[1].padStart(8)}  ${cols[2].padEnd(10)} ${cols[3].padEnd(7)} ${cols[4].padEnd(14)} ${cols[5]}`);
  line(["KPI", "value", "target", "status", "owner", "detail"]);
  for (const r of results) {
    line([r.kpi.name, fmt(r.kpi.unit, r.value), `${r.kpi.target.op} ${fmt(r.kpi.unit, r.kpi.target.value)}`, r.met ? "met" : "MISSED", r.kpi.owner, r.detail]);
  }
}

export async function writeDashboard(file: string) {
  const html = dashboard({ window: WINDOW, results: await compute(), funnel: await funnel(), daily: await daily(), latency: await latency() });
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
  return html;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  printTable(await compute());
  await writeDashboard("out/dashboard.html");
  console.log("   wrote out/dashboard.html");
  await db.end();
}
