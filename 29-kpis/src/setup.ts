import { db } from "./db.js";
import { seeded } from "./random.js";

await db.query(`
  DROP TABLE IF EXISTS events, request_log, change_requests, members, employers;
  CREATE TABLE employers (id text PRIMARY KEY, name text NOT NULL);
  CREATE TABLE members (
    id int PRIMARY KEY,
    employer_id text NOT NULL REFERENCES employers,
    name text NOT NULL,
    eligible boolean NOT NULL,
    service_years int NOT NULL
  );
  -- usage events: what members did, in product terms
  CREATE TABLE events (
    id bigserial PRIMARY KEY,
    at timestamptz NOT NULL,
    member_id int REFERENCES members,
    session_id text NOT NULL,
    name text NOT NULL,
    props jsonb NOT NULL DEFAULT '{}'
  );
  CREATE INDEX ON events (name, at);
  -- one row per HTTP request: what the service did, in technical terms
  CREATE TABLE request_log (
    id bigserial PRIMARY KEY,
    at timestamptz NOT NULL,
    method text NOT NULL,
    route text NOT NULL,
    status int NOT NULL,
    duration_ms numeric(10, 1) NOT NULL
  );
  CREATE INDEX ON request_log (at);
  CREATE TABLE change_requests (
    id serial PRIMARY KEY,
    member_id int NOT NULL REFERENCES members,
    field text NOT NULL,
    value text NOT NULL,
    submitted_at timestamptz NOT NULL,
    resolved_at timestamptz,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved'))
  );
  INSERT INTO employers VALUES ('acme', 'Acme'), ('globex', 'Globex'), ('initech', 'Initech');
`);
const rnd = seeded(29);
const employers = [...Array(60).fill("acme"), ...Array(40).fill("globex"), ...Array(20).fill("initech")];
for (const [i, employer] of employers.entries()) {
  // 10 of the 120 have left the scheme: they can log in, but they are not part of the adoption base
  await db.query("INSERT INTO members VALUES ($1, $2, $3, $4, $5)", [i + 1, employer, `member-${i + 1}`, i % 12 !== 11, 1 + Math.floor(rnd() * 35)]);
}
console.log("setup: employers, members, events (usage), request_log (one row per HTTP request), change_requests");
console.log(`setup: ${employers.length} members (Acme 60, Globex 40, Initech 20), 110 eligible`);
await db.end();
