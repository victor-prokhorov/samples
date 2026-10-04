// The API process (:53146). Reads Postgres through a pg pool; every query becomes a child span of the request.
// REPORT_QUERY=n+1 (the bug) or join (the fix) picks how the employer report is built.
import pg from "pg";
import { API_PORT, PG_URL } from "./config.js";
import { log, server } from "./serve.js";

const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });
const MODE = process.env.REPORT_QUERY === "join" ? "join" : "n+1";

type Line = { id: number; name: string; total: string; months: number; last_period: string | null };

// The bug: one query for the members, then one query per member. Fine with 40 members, slow with 1500.
async function reportNPlusOne(employer: number): Promise<Line[]> {
  const members = await pool.query("SELECT id, name FROM members WHERE employer_id = $1 ORDER BY id", [employer]);
  const lines: Line[] = [];
  for (const m of members.rows) {
    const c = await pool.query(
      "SELECT coalesce(sum(amount), 0) AS total, count(*)::int AS months, max(period)::text AS last_period FROM contributions WHERE member_id = $1",
      [m.id],
    );
    lines.push({ id: m.id, name: m.name, ...c.rows[0] });
  }
  return lines;
}

// The fix: one round trip; Postgres joins and aggregates.
async function reportJoin(employer: number): Promise<Line[]> {
  const { rows } = await pool.query(
    `SELECT m.id, m.name, coalesce(sum(c.amount), 0) AS total, count(c.member_id)::int AS months, max(c.period)::text AS last_period
     FROM members m LEFT JOIN contributions c ON c.member_id = m.id
     WHERE m.employer_id = $1 GROUP BY m.id ORDER BY m.id`,
    [employer],
  );
  return rows;
}

const app = server([
  [
    "GET",
    "/api/employers/:code/members",
    async ({ code }) => {
      const e = await pool.query("SELECT id, name FROM employers WHERE code = $1", [code]);
      if (!e.rowCount) return { status: 404, body: { error: "no such employer" } };
      const lines = MODE === "join" ? await reportJoin(e.rows[0].id) : await reportNPlusOne(e.rows[0].id);
      log.info({ employer: code, members: lines.length, mode: MODE }, "employer report built");
      return { status: 200, body: { employer: e.rows[0].name, members: lines } };
    },
  ],
  [
    "GET",
    "/api/members/:id",
    async ({ id }) => {
      const { rows } = await pool.query(
        `SELECT m.id, m.name, e.name AS employer, coalesce(sum(c.amount), 0) AS total
         FROM members m JOIN employers e ON e.id = m.employer_id LEFT JOIN contributions c ON c.member_id = m.id
         WHERE m.id = $1 GROUP BY m.id, e.name`,
        [Number(id)],
      );
      return rows.length ? { status: 200, body: rows[0] } : { status: 404, body: { error: "no such member" } };
    },
  ],
  [
    "GET",
    "/api/members/:id/statement",
    async ({ id }) => {
      const { rows } = await pool.query("SELECT period::text, amount FROM contributions WHERE member_id = $1 ORDER BY period", [Number(id)]);
      // A second bug, left in on purpose so RED has errors to count: a member with no contribution yet
      // has no last row, and this line throws a TypeError (500) instead of returning an empty statement.
      const latest = rows[rows.length - 1].period;
      return { status: 200, body: { member: Number(id), latest, lines: rows } };
    },
  ],
]);

app.listen(API_PORT, () => log.info({ port: API_PORT, mode: MODE, pid: process.pid }, "api listening"));
