import { db } from "./db.js";

const t0 = Date.now();
await db.query(`
  DROP TABLE IF EXISTS members, employers;
  CREATE TABLE employers (id int PRIMARY KEY, name text NOT NULL);
  INSERT INTO employers VALUES (1, 'Acme'), (2, 'Globex'), (3, 'Initech');
  CREATE TABLE members (
    id int PRIMARY KEY,
    employer_id int NOT NULL REFERENCES employers,
    email text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    birth_date date NOT NULL,
    balance numeric(12, 2) NOT NULL
  );
  -- 500,000 members. Emails are stored as typed (mixed case); the search compares lower(email).
  -- Deliberately NO index on lower(email): that is the slow endpoint the SLO gate catches.
  INSERT INTO members
  SELECT i, 1 + i % 3,
         CASE WHEN i % 2 = 0 THEN 'Member.' ELSE 'member.' END || i || '@' || (ARRAY['acme', 'globex', 'initech'])[1 + i % 3] || '.example',
         'First' || i, 'Last' || i, date '1960-01-01' + (i % 15000), (i % 100000) * 1.5
  FROM generate_series(1, 500000) i;
  ANALYZE members;
`);
const size = await db.query("SELECT pg_size_pretty(pg_total_relation_size('members')) AS size, count(*)::int AS n FROM members");
console.log(`setup: employers (3), members (${size.rows[0].n.toLocaleString("en")} rows, ${size.rows[0].size}), no index on lower(email); ${Date.now() - t0} ms`);
await db.end();
