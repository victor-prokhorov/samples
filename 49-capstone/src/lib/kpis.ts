// The KPI definitions, in the shape of 29-kpis: each one has a question, a formula, a target and an owner, and its value
// is SQL over the usage events. SQL gets $1 = window start (inclusive) and $2 = window end (exclusive), and returns
// n and d: every KPI here is a ratio n / d, shown as a percentage with "n of d" under it.
import { db } from "./db";
import type { User } from "./policy";

export type Kpi = {
  id: "adoption" | "task_success" | "form_errors" | "approval_sla";
  formula: string;
  unit: "%";
  target: { op: ">=" | "<="; value: number };
  owner: "owner.product" | "owner.ux" | "owner.support";
  sql: string;
};

export const WINDOW_DAYS = 28;
export const SLA_DAYS = 3;

export const kpis: Kpi[] = [
  {
    id: "adoption",
    formula: "members with a login event in the window / members",
    unit: "%",
    target: { op: ">=", value: 60 },
    owner: "owner.product",
    sql: `SELECT count(DISTINCT e.member_id) AS n, (SELECT count(*) FROM members) AS d
          FROM events e WHERE e.name = 'login' AND e.member_id IS NOT NULL AND e.at >= $1 AND e.at < $2`,
  },
  {
    id: "task_success",
    formula: "sessions with bank_change_submitted / sessions with bank_change_started",
    unit: "%",
    target: { op: ">=", value: 85 },
    owner: "owner.product",
    sql: `WITH s AS (SELECT session, bool_or(name = 'bank_change_submitted') AS done FROM events
                     WHERE name IN ('bank_change_started', 'bank_change_submitted') AND at >= $1 AND at < $2
                     GROUP BY session HAVING bool_or(name = 'bank_change_started'))
          SELECT count(*) FILTER (WHERE done) AS n, count(*) AS d FROM s`,
  },
  {
    id: "form_errors",
    formula: "bank_change_rejected / (bank_change_rejected + bank_change_submitted)",
    unit: "%",
    target: { op: "<=", value: 10 },
    owner: "owner.ux",
    sql: `SELECT count(*) FILTER (WHERE name = 'bank_change_rejected') AS n, count(*) AS d
          FROM events WHERE name IN ('bank_change_rejected', 'bank_change_submitted') AND at >= $1 AND at < $2`,
  },
  {
    id: "approval_sla",
    formula: `changes approved within ${SLA_DAYS} days / changes approved in the window`,
    unit: "%",
    target: { op: ">=", value: 90 },
    owner: "owner.support",
    sql: `SELECT count(*) FILTER (WHERE approved_at <= created_at + interval '${SLA_DAYS} days') AS n, count(*) AS d
          FROM change_requests WHERE status = 'approved' AND approved_at >= $1 AND approved_at < $2`,
  },
];

export const meets = (k: Kpi, value: number) => (k.target.op === ">=" ? value >= k.target.value : value <= k.target.value);

export type KpiResult = { kpi: Kpi; value: number; n: number; d: number; met: boolean };

// Runs as the signed-in staff user: RLS lets staff read events, members and change requests, nobody else.
export async function computeKpis(u: User, now = new Date()) {
  const from = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  return db(u, async (c) => {
    const results: KpiResult[] = [];
    for (const kpi of kpis) {
      const r = (await c.query<{ n: string; d: string }>(kpi.sql, [from, now])).rows[0];
      const [n, d] = [Number(r.n), Number(r.d)];
      const value = d ? (100 * n) / d : 0;
      results.push({ kpi, value, n, d, met: meets(kpi, value) });
    }
    const events = Number((await c.query("SELECT count(*) FROM events WHERE at >= $1 AND at < $2", [from, now])).rows[0].count);
    return { results, events };
  });
}
