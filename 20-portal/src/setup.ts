import { pool } from "./lib/db";

await pool.query(`
  CREATE TABLE employers (id INT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE members (
    id INT PRIMARY KEY,
    employer_id INT NOT NULL REFERENCES employers,
    username TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL
  );
  CREATE TABLE addresses (member_id INT PRIMARY KEY REFERENCES members, line1 TEXT NOT NULL, city TEXT NOT NULL, postcode TEXT NOT NULL);
  CREATE TABLE contributions (
    member_id INT NOT NULL REFERENCES members,
    month DATE NOT NULL,
    employee NUMERIC(10, 2) NOT NULL,
    employer NUMERIC(10, 2) NOT NULL,
    PRIMARY KEY (member_id, month)
  );
  CREATE TABLE change_requests (
    id SERIAL PRIMARY KEY,
    member_id INT NOT NULL REFERENCES members,
    kind TEXT NOT NULL,
    payload JSONB NOT NULL,
    effective_from DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX one_pending_change_per_member ON change_requests (member_id, kind) WHERE status = 'pending';

  INSERT INTO employers VALUES (1, 'Acme'), (2, 'Globex'), (3, 'Initech');
  INSERT INTO members VALUES
    (1, 1, 'alice', 'Alice Martin', 'alice@example.com'),
    (2, 2, 'bob', 'Bob Smith', 'bob@example.com'),
    (3, 3, 'carol', 'Carol Jones', 'carol@example.com');
  INSERT INTO addresses VALUES
    (1, '12 Old Road', 'Springfield', 'AB1 2CD'),
    (2, '3 Station Street', 'Shelbyville', 'EF3 4GH'),
    (3, '9 Mill Lane', 'Ogdenville', 'JK5 6LM');
  INSERT INTO contributions
  SELECT m.id, date '2026-01-01' + make_interval(months => g), 100 + 25 * m.id, 150 + 25 * m.id
    FROM members m, generate_series(0, 5) g;
`);
console.log("setup: employers, members (alice, bob, carol), addresses, contributions, change_requests (at most one pending address change per member)");
await pool.end();
