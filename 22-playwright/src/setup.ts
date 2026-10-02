import { scryptSync } from "node:crypto";
import pg from "pg";
import { TEMPLATE, cloneTemplate, dropDatabase, url, admin } from "./db.js";

const hash = (password: string) => scryptSync(password, "sample-salt", 32).toString("hex");

await dropDatabase(TEMPLATE);
const a = admin();
await a.query(`CREATE DATABASE ${TEMPLATE}`);
await a.end();

const t = new pg.Pool({ connectionString: url(TEMPLATE) });
await t.query(`
  CREATE TABLE employers (id INT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE members (
    id INT PRIMARY KEY,
    employer_id INT NOT NULL REFERENCES employers,
    username TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL
  );
  CREATE TABLE contributions (
    member_id INT NOT NULL REFERENCES members,
    month DATE NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    PRIMARY KEY (member_id, month)
  );
  CREATE TABLE change_requests (
    id SERIAL PRIMARY KEY,
    member_id INT NOT NULL REFERENCES members,
    kind TEXT NOT NULL,
    value TEXT NOT NULL,
    effective_from DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  -- One pending change per kind, enforced by the database too: two concurrent submissions both pass the check in rules.ts.
  CREATE UNIQUE INDEX one_pending_change_per_kind ON change_requests (member_id, kind) WHERE status = 'pending';
  INSERT INTO employers VALUES (1, 'Acme'), (2, 'Globex');
`);
await t.query("INSERT INTO members VALUES (1, 1, 'alice', 'Alice Martin', $1), (2, 2, 'bob', 'Bob Smith', $2)", [hash("alice-password"), hash("bob-password")]);
await t.query(`
  INSERT INTO contributions
  SELECT 1, date '2026-01-01' + make_interval(months => m), 225.00 FROM generate_series(0, 5) m
  UNION ALL
  SELECT 2, date '2026-01-01' + make_interval(months => m), 180.00 FROM generate_series(0, 2) m`);
await t.end();
await cloneTemplate("portal");
console.log(`setup: template database ${TEMPLATE} (employers, members, contributions, change_requests; alice and bob), and portal cloned from it for the hand-run server`);
