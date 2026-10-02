import { db } from "./db.js";

const names = ["alice", "bob", "carol", "dan", "erin", "frank", "grace", "heidi", "ivan", "judy", "ken", "lena", "mike", "nina", "oscar", "paula"];
const employer = (i: number) => (i < 6 ? "acme" : i < 11 ? "globex" : "initech");

await db.query(`
  CREATE TABLE members (
    id SERIAL PRIMARY KEY,
    member_no TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    employer TEXT NOT NULL
  );
  CREATE TABLE contributions (
    member_id INT NOT NULL REFERENCES members,
    period DATE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    PRIMARY KEY (member_id, period)
  );
  CREATE TABLE statement_jobs (
    year INT NOT NULL,
    member_id INT NOT NULL REFERENCES members,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'retry', 'sent', 'dead')),
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_by TEXT,
    locked_until TIMESTAMPTZ,
    message_id TEXT NOT NULL UNIQUE,
    pdf_sha256 TEXT,
    last_error TEXT,
    sent_at TIMESTAMPTZ,
    PRIMARY KEY (year, member_id)
  );
  CREATE INDEX statement_jobs_due ON statement_jobs (year, next_attempt_at) WHERE status IN ('pending', 'retry', 'sending');
  CREATE TABLE statement_attempts (
    id BIGSERIAL PRIMARY KEY,
    year INT NOT NULL,
    member_id INT NOT NULL,
    attempt INT NOT NULL,
    worker TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('sent', 'retry', 'dead', 'in_doubt')),
    detail TEXT,
    at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
  )`);
for (const [i, name] of names.entries()) {
  const { rows } = await db.query<{ id: number }>("INSERT INTO members (member_no, name, email, employer) VALUES ($1, $2, $3, $4) RETURNING id", [
    `M${String(i + 1).padStart(4, "0")}`,
    name[0].toUpperCase() + name.slice(1),
    `${name}@${employer(i)}.example`,
    employer(i),
  ]);
  await db.query(
    `INSERT INTO contributions SELECT $1, make_date(2025, m, 1), round((150 + $2 * 17.5 + m * 3.25)::numeric, 2) FROM generate_series(1, 12) m`,
    [rows[0].id, i],
  );
}
console.log(`setup: ${names.length} members with 12 monthly contributions for 2025, statement_jobs (primary key year + member), statement_attempts`);
await db.end();
