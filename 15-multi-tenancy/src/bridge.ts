import pg from "pg";
import { closeAll, pool, reason, rejection, step, tx } from "./db.js";
import { BRIDGE_TENANTS } from "./schema.js";

const app = pool("app", "bridge");
const owner = pool("migrator", "bridge");
const single = pool("app", "bridge", 1);

const MIGRATION_2 = "ALTER TABLE invoices ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR', ADD CONSTRAINT invoices_number_key UNIQUE (number)";

const EXTRA_TENANTS = 1000;

function asSchemaTenant<T>(p: pg.Pool, tenant: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  return tx(p, async (c) => {
    await c.query("SELECT set_config('role', $1, true), set_config('search_path', $2, true)", [`tenant_${tenant}`, `t_${tenant}`]);
    return fn(c);
  });
}

const whoAmI = "SELECT current_user AS who, count(*)::int AS n FROM invoices";

async function describe(run: Promise<pg.QueryResult>) {
  const { rows } = await run;
  return `runs as ${rows[0].who}, sees ${rows[0].n} invoices`;
}

async function migrateAll(schemas: string[], log: boolean) {
  for (const schema of schemas) {
    const outcome = await tx(owner, async (c) => {
      await c.query("SELECT set_config('search_path', $1, true)", [schema]);
      const { rowCount } = await c.query("SELECT 1 FROM schema_migrations WHERE version = 2");
      if (rowCount) return "already at 2, skipped";
      await c.query(MIGRATION_2);
      await c.query("INSERT INTO schema_migrations VALUES (2)");
      return "migrated to 2";
    }).catch((err) => {
      if (log) console.log(`     ${schema}: failed: ${reason(err)}; loop stopped`);
      throw err;
    });
    if (log) console.log(`     ${schema}: ${outcome}`);
  }
}

async function versions() {
  const { rows } = await owner.query(BRIDGE_TENANTS.map((t) => `SELECT 't_${t}' AS schema, max(version) AS v FROM t_${t}.schema_migrations`).join(" UNION ALL "));
  return rows.map((r) => `${r.schema} ${r.v}`).join(", ");
}

async function catalog(label: string) {
  const { rows } = await owner.query(`
    SELECT (SELECT count(*) FROM pg_namespace WHERE nspname LIKE 't\\_%')::int AS schemas, (SELECT count(*) FROM pg_class)::int AS relations,
      (SELECT count(*) FROM pg_attribute)::int AS attributes, pg_size_pretty(sum(pg_total_relation_size(oid))) AS size
    FROM pg_class WHERE relnamespace = 'pg_catalog'::regnamespace AND relkind = 'r'`);
  const r = rows[0];
  console.log(`   ${label.padEnd(32)} ${r.schemas} tenant schemas, pg_class ${r.relations} rows, pg_attribute ${r.attributes} rows, system catalogs ${r.size}`);
}

async function main() {
  step("11. Bridge: one schema per tenant", "same table names in every schema; per request the app sets search_path to the tenant's schema and the role to the tenant's role, both LOCAL");
  for (const t of BRIDGE_TENANTS) {
    const { rows } = await asSchemaTenant(app, t, (c) => c.query("SELECT current_user AS who, current_schema() AS schema, string_agg('#' || number, ', ' ORDER BY id) AS numbers FROM invoices"));
    console.log(`   ${t.padEnd(8)} runs as ${rows[0].who}, search_path ${rows[0].schema}: invoices ${rows[0].numbers}`);
  }
  step("12. search_path is not a security boundary", "schema-qualified names ignore search_path; only privileges stop them, so each tenant needs its own role and the app must switch to it");
  const shared = await tx(owner, async (c) => {
    await c.query("SELECT set_config('search_path', 't_hooli', true)");
    return c.query("SELECT count(*)::int AS n FROM t_initrode.invoices");
  });
  console.log(`   one shared role, search_path t_hooli, SELECT FROM t_initrode.invoices: ${shared.rows[0].n} rows of initrode's`);
  console.log(`   role tenant_hooli, same query: rejected: ${await rejection(() => asSchemaTenant(app, "hooli", (c) => c.query("SELECT count(*) FROM t_initrode.invoices")))}`);
  step("13. search_path and role leak on a pooled connection", "pool of 1 connection: session-level settings stay on the connection, the next request inherits the previous tenant's schema and role");
  await single.query("SELECT set_config('role', 'tenant_hooli', false), set_config('search_path', 't_hooli', false)");
  console.log("   request 1 (hooli): SET ROLE tenant_hooli; SET search_path = t_hooli (session level)");
  console.log(`   request 2 (initrode, forgot the context): ${await describe(single.query(whoAmI))} (hooli's)`);
  await single.query("DISCARD ALL");
  await asSchemaTenant(single, "hooli", (c) => c.query(whoAmI));
  console.log("   after DISCARD ALL (a pool reset query), request 1 (hooli): the same settings, LOCAL to its transaction");
  console.log(`   request 2 (initrode, forgot the context): rejected: ${await rejection(() => single.query(whoAmI))} (loud, where RLS returned zero rows)`);
  step("14. Every migration runs once per schema", "migration 2 (add currency, UNIQUE (number)) loops over the schemas, one transaction each; tenant data differs, so one schema can fail and leave the fleet half migrated");
  await migrateAll(BRIDGE_TENANTS.map((t) => `t_${t}`), true).catch(() => undefined);
  console.log(`   versions now: ${await versions()}; the app must handle both shapes until every schema is done`);
  await owner.query("UPDATE t_initrode.invoices SET number = 2 WHERE id = 2");
  console.log("   fixed initrode's duplicate invoice number, re-ran the loop:");
  await migrateAll(BRIDGE_TENANTS.map((t) => `t_${t}`), true);
  console.log(`   versions now: ${await versions()}`);
  step("15. Catalog bloat at many tenants", `every schema copies every table, index and sequence into the system catalogs; ${EXTRA_TENANTS} more tenants, then migration 2 across all of them`);
  await catalog(`${BRIDGE_TENANTS.length} tenants`);
  const extra = Array.from({ length: EXTRA_TENANTS }, (_, i) => `t_extra_${i + 1}`);
  for (let i = 0; i < extra.length; i += 100) {
    await owner.query(extra.slice(i, i + 100).map((s) => `CREATE SCHEMA ${s}; CREATE TABLE ${s}.schema_migrations (version INT PRIMARY KEY); CREATE TABLE ${s}.invoices (id SERIAL PRIMARY KEY, number INT NOT NULL, amount_cents INT NOT NULL); INSERT INTO ${s}.schema_migrations VALUES (1)`).join("; "));
  }
  await catalog(`${BRIDGE_TENANTS.length + EXTRA_TENANTS} tenants`);
  const started = Date.now();
  await migrateAll(extra, false);
  console.log(`   migration 2 over ${EXTRA_TENANTS} more schemas: ${((Date.now() - started) / 1000).toFixed(1)}s, one transaction each (varies by machine)`);
  await catalog(`${BRIDGE_TENANTS.length + EXTRA_TENANTS} tenants, after migration 2`);
  await closeAll();
}

main();
