import { pool } from "./db.js";

await pool.query(`
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    monthly_amount NUMERIC(10, 2) NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bank_accounts (
    member_id TEXT NOT NULL REFERENCES members,
    iban TEXT NOT NULL,
    effective_from DATE NOT NULL,
    PRIMARY KEY (member_id, effective_from)
  );
  CREATE TABLE IF NOT EXISTS change_requests (
    id SERIAL PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members,
    requested_by TEXT NOT NULL,
    iban TEXT NOT NULL,
    effective_from DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'awaiting second approval', 'approved'))
  );
  CREATE TABLE IF NOT EXISTS approvals (
    request_id INT NOT NULL REFERENCES change_requests,
    approver TEXT NOT NULL,
    PRIMARY KEY (request_id, approver)
  );
  CREATE TABLE IF NOT EXISTS spec_results (
    implementation TEXT NOT NULL,
    requirement TEXT NOT NULL,
    scenario TEXT NOT NULL,
    status TEXT NOT NULL,
    PRIMARY KEY (implementation, requirement, scenario)
  )`);
console.log("setup: members, bank_accounts (one row per effective date), change_requests, approvals, spec_results (the traceability matrix)");
await pool.end();
