import { asTenant, closeAll, pool } from "./db.js";
import { BRIDGE_TENANTS, SILO_SCHEMA } from "./schema.js";

const SILOS = [
  { tenant: "initech", customer: "Ian", invoices: [[1, 4200], [2, 1800]] },
  { tenant: "umbrella", customer: "Uma", invoices: [[1, 9900]] },
];

const BRIDGE_INVOICES: Record<string, number[][]> = { hooli: [[1, 500], [2, 700]], initrode: [[1, 300], [1, 310]], vandelay: [[1, 800]] };

async function main() {
  const admin = pool("postgres", "postgres");
  for (const db of ["pool", "bridge", "silo_initech", "silo_umbrella", "silo_bigco"]) await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
  await admin.query(`DROP ROLE IF EXISTS ${BRIDGE_TENANTS.map((t) => `tenant_${t}`).join(", ")}, app, migrator`);
  await admin.query("CREATE ROLE migrator LOGIN PASSWORD 'migrator' CREATEDB");
  await admin.query("CREATE ROLE app LOGIN PASSWORD 'app' NOSUPERUSER NOBYPASSRLS");
  for (const t of BRIDGE_TENANTS) await admin.query(`CREATE ROLE tenant_${t} NOLOGIN; GRANT tenant_${t} TO app`);
  for (const db of ["pool", "bridge", ...SILOS.map((s) => `silo_${s.tenant}`)]) await admin.query(`CREATE DATABASE ${db} OWNER migrator`);
  const shared = pool("migrator", "pool");
  await shared.query(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, placement TEXT NOT NULL, db TEXT NOT NULL, statement_timeout_ms INT NOT NULL, moving BOOLEAN NOT NULL DEFAULT false);
    CREATE TABLE customers (id SERIAL PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants, name TEXT NOT NULL);
    CREATE TABLE invoices (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants,
      customer_id INT NOT NULL REFERENCES customers,
      number INT NOT NULL UNIQUE,
      amount_cents INT NOT NULL
    );
    GRANT SELECT ON tenants TO app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON customers, invoices TO app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app;
    INSERT INTO tenants VALUES
      ('acme', 'pool', 'pool', 5000), ('globex', 'pool', 'pool', 5000), ('bigco', 'pool', 'pool', 200),
      ('initech', 'silo', 'silo_initech', 5000), ('umbrella', 'silo', 'silo_umbrella', 5000);
    INSERT INTO customers (tenant_id, name) VALUES ('acme', 'Ada'), ('globex', 'Grace'), ('bigco', 'Big Buyer');
    INSERT INTO invoices (tenant_id, customer_id, number, amount_cents) VALUES ('acme', 1, 1, 1200), ('acme', 1, 2, 3400), ('globex', 2, 100, 990);
    INSERT INTO invoices (tenant_id, customer_id, number, amount_cents) SELECT 'bigco', 3, 1000 + n, n % 5000 FROM generate_series(1, 20000) n;
    ANALYZE`);
  console.log("setup: roles migrator (owner of every table, CREATEDB) and app (NOSUPERUSER NOBYPASSRLS, not an owner)");
  console.log("setup: database pool, one shared schema, first version: tenant_id on every row, no RLS, UNIQUE (number), FOREIGN KEY (customer_id)");
  console.log("setup: tenants acme (2 invoices), globex (1), bigco (20000); directory table tenants says where each tenant lives");
  const bridge = pool("migrator", "bridge");
  for (const t of BRIDGE_TENANTS) {
    await bridge.query(`
      CREATE SCHEMA t_${t};
      CREATE TABLE t_${t}.schema_migrations (version INT PRIMARY KEY);
      CREATE TABLE t_${t}.invoices (id SERIAL PRIMARY KEY, number INT NOT NULL, amount_cents INT NOT NULL);
      INSERT INTO t_${t}.schema_migrations VALUES (1);
      INSERT INTO t_${t}.invoices (number, amount_cents) VALUES ${BRIDGE_INVOICES[t].map(([n, a]) => `(${n}, ${a})`).join(", ")};
      GRANT USAGE ON SCHEMA t_${t} TO tenant_${t};
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA t_${t} TO tenant_${t};
      GRANT USAGE ON ALL SEQUENCES IN SCHEMA t_${t} TO tenant_${t};
      ALTER DEFAULT PRIVILEGES IN SCHEMA t_${t} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tenant_${t}`);
  }
  console.log(`setup: database bridge, one schema per tenant (${BRIDGE_TENANTS.map((t) => `t_${t}`).join(", ")}) at migration 1, one role per tenant granted to app`);
  for (const s of SILOS) {
    const silo = pool("migrator", `silo_${s.tenant}`);
    await silo.query(SILO_SCHEMA);
    await asTenant(silo, s.tenant, async (c) => {
      await c.query("INSERT INTO customers (tenant_id, name) VALUES ($1, $2)", [s.tenant, s.customer]);
      for (const [number, amount] of s.invoices) await c.query("INSERT INTO invoices (tenant_id, customer_id, number, amount_cents) VALUES ($1, 1, $2, $3)", [s.tenant, number, amount]);
    });
  }
  console.log(`setup: databases ${SILOS.map((s) => `silo_${s.tenant}`).join(", ")}, one per tenant, same schema as the pool's fixed version`);
  await closeAll();
}

main();
