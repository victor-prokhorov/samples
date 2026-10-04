import pg from "pg";

export const PG = { host: "localhost", port: 55464, user: "postgres", password: "postgres" };
export const pool = (database: string) => new pg.Pool({ ...PG, database, max: 5 });

// The schema keeps two rules of its own: the rate range (CHECK) and one pending change per member
// (a partial unique index), so two concurrent requests cannot both get through.
export const SCHEMA = `
CREATE TABLE members (
  id text PRIMARY KEY,
  name text NOT NULL,
  employer text NOT NULL,
  salary numeric(10, 2) NOT NULL,
  rate numeric(4, 1) NOT NULL
);
CREATE TABLE contribution_changes (
  id serial PRIMARY KEY,
  member_id text NOT NULL REFERENCES members(id),
  rate numeric(4, 1) NOT NULL CHECK (rate BETWEEN 2 AND 15),
  effective_from date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_pending_change ON contribution_changes (member_id) WHERE status = 'pending';
`;

export const SEED = `
INSERT INTO members (id, name, employer, salary, rate) VALUES
  ('M0001', 'Alice Martin', 'Acme', 42000, 5),
  ('M0002', 'Bruno Petit', 'Globex', 36500, 4),
  ('M0003', 'Chloe Durand', 'Initech', 51000, 7.5);
`;

// Drops and recreates a database from the schema and seed: setup runs it for the app's database,
// the API tests for theirs.
export async function recreate(database: string) {
  const admin = new pg.Client({ ...PG, database: "postgres" });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${database}`);
  await admin.end();
  const c = new pg.Client({ ...PG, database });
  await c.connect();
  await c.query(SCHEMA + SEED);
  await c.end();
}
