// The single definition of every KPI: the report, the dashboard and the check all read this list.
// SQL gets $1 = window start (inclusive) and $2 = window end (exclusive), and returns value and detail.

export type Kpi = {
  id: string;
  name: string;
  question: string;
  formula: string;
  unit: "%" | "ms" | "s";
  target: { op: ">=" | "<="; value: number };
  owner: string;
  sql: string;
};

export const SLO = 99.5;
export const SLA_DAYS = 3;

const tasks = `
  SELECT session_id,
         min(at) FILTER (WHERE name = 'change_started') AS started,
         min(at) FILTER (WHERE name = 'change_submitted') AS submitted
  FROM events WHERE at >= $1 AND at < $2 AND name IN ('change_started', 'change_submitted')
  GROUP BY session_id HAVING bool_or(name = 'change_started')`;

const userRequests = `request_log WHERE at >= $1 AND at < $2 AND route NOT IN ('/health', '/staff/changes/:id/resolve')`;

export const kpis: Kpi[] = [
  {
    id: "adoption",
    name: "Adoption",
    question: "Do eligible members use the portal at all?",
    formula: "eligible members with at least one login in the window / eligible members",
    unit: "%",
    target: { op: ">=", value: 60 },
    owner: "product owner",
    sql: `SELECT 100.0 * count(DISTINCT e.member_id) / (SELECT count(*) FROM members WHERE eligible) AS value,
                 count(DISTINCT e.member_id) || ' of ' || (SELECT count(*) FROM members WHERE eligible) || ' eligible members' AS detail
          FROM events e JOIN members m ON m.id = e.member_id
          WHERE e.name = 'login' AND m.eligible AND e.at >= $1 AND e.at < $2`,
  },
  {
    id: "task_success",
    name: "Change request task success",
    question: "When members start a change request, do they finish it?",
    formula: "sessions that opened the form and submitted a valid request / sessions that opened the form",
    unit: "%",
    target: { op: ">=", value: 85 },
    owner: "product owner",
    sql: `WITH t AS (${tasks})
          SELECT 100.0 * count(submitted) / count(*) AS value, count(submitted) || ' of ' || count(*) || ' tasks' AS detail FROM t`,
  },
  {
    id: "task_time",
    name: "Change request completion time (median)",
    question: "How long does a successful change request take?",
    formula: "median of (first change_submitted - first change_started) over successful tasks",
    unit: "s",
    target: { op: "<=", value: 240 },
    owner: "UX lead",
    sql: `WITH t AS (${tasks})
          SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM submitted - started)) AS value,
                 'p90 ' || round(percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM submitted - started))) || ' s' AS detail
          FROM t WHERE submitted IS NOT NULL`,
  },
  {
    id: "form_errors",
    name: "Form error rate",
    question: "How often does the change form reject what members type?",
    formula: "POST /changes answered 422 / POST /changes answered 201 or 422",
    unit: "%",
    target: { op: "<=", value: 10 },
    owner: "UX lead",
    sql: `SELECT 100.0 * count(*) FILTER (WHERE status = 422) / count(*) AS value,
                 count(*) FILTER (WHERE status = 422) || ' of ' || count(*) || ' submissions' AS detail
          FROM request_log WHERE at >= $1 AND at < $2 AND method = 'POST' AND route = '/changes' AND status IN (201, 422)`,
  },
  {
    id: "latency_p95",
    name: "Latency p95, slowest route",
    question: "How long do the slowest 5% of requests wait on the worst member page?",
    formula: "max over member routes of the 95th percentile of duration_ms (not /health, not staff)",
    unit: "ms",
    target: { op: "<=", value: 300 },
    owner: "tech lead",
    sql: `SELECT p95 AS value, route || ', all routes together ' || round(overall) || ' ms' AS detail
          FROM (SELECT method || ' ' || route AS route, percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95 FROM ${userRequests} GROUP BY 1) r,
               (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS overall FROM ${userRequests}) o
          ORDER BY p95 DESC LIMIT 1`,
  },
  {
    id: "availability",
    name: "Availability",
    question: "What share of member requests did the service answer without a server error?",
    formula: "member requests with status < 500 / member requests",
    unit: "%",
    target: { op: ">=", value: SLO },
    owner: "service owner",
    sql: `SELECT 100.0 * count(*) FILTER (WHERE status < 500) / count(*) AS value,
                 count(*) FILTER (WHERE status >= 500) || ' of ' || count(*) || ' requests failed' AS detail
          FROM ${userRequests}`,
  },
  {
    id: "error_budget",
    name: "Error budget remaining",
    question: "How much more failure can the SLO absorb this window?",
    formula: `1 - failed requests / ((1 - ${SLO}%) x member requests)`,
    unit: "%",
    target: { op: ">=", value: 0 },
    owner: "service owner",
    sql: `SELECT 100.0 * (1 - count(*) FILTER (WHERE status >= 500) / ((1 - ${SLO} / 100.0) * count(*))) AS value,
                 count(*) FILTER (WHERE status >= 500) || ' failed of ' || round((1 - ${SLO} / 100.0) * count(*), 1) || ' allowed' AS detail
          FROM ${userRequests}`,
  },
  {
    id: "sla",
    name: `Requests resolved within ${SLA_DAYS} days`,
    question: "Do staff handle change requests within the service level agreed with employers?",
    formula: `requests resolved within ${SLA_DAYS} days / requests whose ${SLA_DAYS}-day deadline fell in the window (open ones count as missed)`,
    unit: "%",
    target: { op: ">=", value: 90 },
    owner: "support lead",
    sql: `SELECT 100.0 * count(*) FILTER (WHERE resolved_at <= submitted_at + interval '${SLA_DAYS} days') / count(*) AS value,
                 count(*) FILTER (WHERE resolved_at <= submitted_at + interval '${SLA_DAYS} days') || ' of ' || count(*) || ' due' AS detail
          FROM change_requests WHERE submitted_at + interval '${SLA_DAYS} days' >= $1 AND submitted_at + interval '${SLA_DAYS} days' < $2`,
  },
];

export function validate(defs: Partial<Kpi>[]) {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const k of defs) {
    const id = k.id ?? "(no id)";
    if (k.id && ids.has(k.id)) errors.push(`${id}: duplicate id`);
    if (k.id) ids.add(k.id);
    for (const field of ["name", "question", "formula", "owner", "sql"] as const) if (!k[field]) errors.push(`${id}: no ${field}`);
    if (!k.target || !Number.isFinite(k.target.value)) errors.push(`${id}: no target`);
    if (!k.unit) errors.push(`${id}: no unit`);
  }
  return errors;
}

export const meets = (k: Kpi, value: number) => (k.target.op === ">=" ? value >= k.target.value : value <= k.target.value);

// two decimals near 100%, where 99.48 and 99.5 must not both print as 99.5
export const fmt = (unit: Kpi["unit"], v: number) => (unit === "%" ? `${v.toFixed(v >= 99 && v < 100 ? 2 : 1)}%` : `${Math.round(v)} ${unit}`);
