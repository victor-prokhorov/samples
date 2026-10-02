import { db } from "./config.js";

await db.query(`
  CREATE TABLE members (
    member_no TEXT PRIMARY KEY,
    employer TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL
  );
  INSERT INTO members VALUES
    ('M0001', 'acme', 'Alice Martin', '1 rue des Lilas, Lyon'),
    ('M0002', 'acme', 'Erin Laurent', '8 avenue Foch, Lille'),
    ('M0003', 'globex', 'Frank Girard', '3 quai Est, Nantes');

  -- Which IdP group grants which app role; employer scopes an employer-admin to one employer.
  CREATE TABLE role_mappings (
    idp_group TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('member', 'employer-admin', 'staff')),
    employer TEXT,
    CHECK ((role = 'employer-admin') = (employer IS NOT NULL))
  );
  INSERT INTO role_mappings VALUES
    ('portal-members', 'member', NULL),
    ('acme-hr', 'employer-admin', 'acme'),
    ('globex-hr', 'employer-admin', 'globex'),
    ('it-staff', 'staff', NULL);

  CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    issuer TEXT NOT NULL,
    sub TEXT NOT NULL,
    email TEXT,
    name TEXT,
    member_no TEXT REFERENCES members,
    groups TEXT[] NOT NULL,
    first_login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (issuer, sub)
  );

  CREATE TABLE login_transactions (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    nonce TEXT NOT NULL,
    code_verifier TEXT NOT NULL,
    return_to TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE sessions (
    id_hash TEXT PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users,
    id_token TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
  )`);
console.log("setup: members, role_mappings (IdP group -> app role), users (key issuer + sub), login_transactions, sessions (sha256 of the cookie)");
await db.end();
