// Tables and seed data: three employers, their members, and two years of monthly contributions per member.
// The last three members joined this month and have no contribution yet (the statement route trips over them).
import pg from "pg";
import { PG_URL } from "./config.js";
import { EMPLOYERS, JOINERS, MONTHS } from "./data.js";

const db = new pg.Client(PG_URL);
await db.connect();
await db.query(`
  DROP TABLE IF EXISTS contributions, members, employers;
  CREATE TABLE employers (id serial PRIMARY KEY, code text UNIQUE NOT NULL, name text NOT NULL);
  CREATE TABLE members (
    id serial PRIMARY KEY,
    employer_id int NOT NULL REFERENCES employers(id),
    name text NOT NULL,
    joined date NOT NULL
  );
  CREATE INDEX members_employer ON members (employer_id);
  CREATE TABLE contributions (
    member_id int NOT NULL REFERENCES members(id),
    period date NOT NULL,
    amount numeric(10,2) NOT NULL,
    PRIMARY KEY (member_id, period)
  );
`);
for (const e of EMPLOYERS) {
  const { rows } = await db.query("INSERT INTO employers (code, name) VALUES ($1, $2) RETURNING id", [e.code, e.name]);
  await db.query(
    `INSERT INTO members (employer_id, name, joined)
     SELECT $1, $2 || ' member ' || lpad(n::text, 3, '0'), date '2024-09-01' FROM generate_series(1, $3) n`,
    [rows[0].id, e.name, e.members],
  );
}
await db.query("UPDATE members SET joined = date '2026-10-01' WHERE id = ANY($1)", [JOINERS]);
await db.query(
  `INSERT INTO contributions (member_id, period, amount)
   SELECT m.id, (date '2024-10-01' + make_interval(months => k))::date, 150 + (m.id * 37 + k * 11) % 250
   FROM members m, generate_series(0, $1 - 1) k
   WHERE m.joined < date '2026-10-01'`,
  [MONTHS],
);
await db.query("VACUUM ANALYZE"); // after a bulk load: statistics, visibility map and hint bits, so autovacuum does not kick in mid-demo
const counts = await db.query(
  `SELECT e.name, count(DISTINCT m.id)::int AS members, min(m.id) AS first, max(m.id) AS last, count(c.*)::int AS contributions
   FROM employers e JOIN members m ON m.employer_id = e.id LEFT JOIN contributions c ON c.member_id = m.id
   GROUP BY e.id ORDER BY e.id`,
);
console.log(`setup: employers, members, contributions (${MONTHS} months per member)`);
for (const r of counts.rows) console.log(`setup: ${r.name.padEnd(8)} members ${r.first}..${r.last} (${r.members}), ${r.contributions} contributions`);
console.log(`setup: joined this month, no contribution yet: members ${JOINERS.join(", ")}`);
await db.end();
