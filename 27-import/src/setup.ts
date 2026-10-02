import { db } from "./db.js";

await db.query(`
  CREATE TABLE employers (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );
  INSERT INTO employers VALUES ('acme', 'Acme'), ('globex', 'Globex'), ('initech', 'Initech');

  CREATE TABLE import_batches (
    id SERIAL PRIMARY KEY,
    file_name TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('members', 'contributions')),
    employer TEXT NOT NULL REFERENCES employers,
    period TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('applied', 'refused')),
    reason TEXT,
    rows_declared INT,
    rows_received INT,
    accepted INT,
    rejected INT,
    inserted INT,
    updated INT,
    unchanged INT,
    missing INT,
    amount_declared NUMERIC(12, 2),
    amount_accepted NUMERIC(12, 2),
    amount_rejected NUMERIC(12, 2),
    at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX import_batches_applied_once ON import_batches (sha256) WHERE status = 'applied';

  CREATE TABLE import_rejects (
    batch_id INT NOT NULL REFERENCES import_batches,
    line_no INT NOT NULL,
    rule TEXT NOT NULL,
    detail TEXT NOT NULL,
    raw JSONB NOT NULL,
    PRIMARY KEY (batch_id, line_no, rule)
  );

  CREATE TABLE members (
    employer TEXT NOT NULL REFERENCES employers,
    member_no TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    birth_date DATE NOT NULL,
    last_batch_id INT NOT NULL REFERENCES import_batches,
    PRIMARY KEY (employer, member_no)
  );

  CREATE TABLE contributions (
    employer TEXT NOT NULL,
    member_no TEXT NOT NULL,
    period TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    last_batch_id INT NOT NULL REFERENCES import_batches,
    PRIMARY KEY (employer, member_no, period),
    FOREIGN KEY (employer, member_no) REFERENCES members
  );

  CREATE TABLE naive_contributions (
    id SERIAL PRIMARY KEY,
    employer TEXT NOT NULL,
    member_no TEXT NOT NULL,
    period TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL
  )`);
console.log("setup: employers, members (key employer + member_no), contributions (key employer + member_no + period), import_batches, import_rejects, naive_contributions (no key)");
await db.end();
