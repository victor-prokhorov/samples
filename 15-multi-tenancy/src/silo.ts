import pg from "pg";
import { asTenant, closeAll, pool, reason, rejection, step } from "./db.js";
import { forget, read, route, write } from "./router.js";
import { SILO_SCHEMA } from "./schema.js";

const shared = pool("migrator", "pool");
const admin = pool("migrator", "postgres");

const counted = "SELECT current_database() AS db, count(*)::int AS n, coalesce(sum(amount_cents), 0)::int AS total FROM invoices";

const newInvoice = "INSERT INTO invoices (tenant_id, customer_id, number, amount_cents) VALUES ('bigco', 3, $1, 100) RETURNING id, current_database() AS db";

function column(rows: Record<string, unknown>[], key: string) {
  return rows.map((r) => r[key]);
}

async function where(tenant: string) {
  const { rows } = await read(tenant, (c) => c.query(counted));
  return `${tenant.padEnd(8)} -> ${rows[0].db}: invoices ${rows[0].n}, total ${rows[0].total}`;
}

async function main() {
  step("16. Silo: one database per tenant", "the directory maps each tenant to a database; the router opens a pool per database and the same code runs everywhere");
  for (const t of ["acme", "globex", "initech", "umbrella"]) console.log(`   ${await where(t)}`);
  step("17. No path between databases", "a connection is bound to one database; a bug in a query cannot reach another tenant's rows");
  const initech = await route("initech");
  console.log(`   initech's connection reads silo_umbrella.public.invoices: rejected: ${await rejection(() => initech.pool.query("SELECT count(*) FROM silo_umbrella.public.invoices"))}`);
  step("18. What a silo costs", "every database carries its own catalogs, and every database needs its own connections: connections are per database, a pool cannot share them");
  const { rows: sizes } = await admin.query("SELECT datname, pg_size_pretty(pg_database_size(datname)) AS size FROM pg_database WHERE datname IN ('pool', 'silo_initech', 'silo_umbrella') ORDER BY 1");
  console.log(`   on disk: ${sizes.map((r) => `${r.datname} ${r.size}`).join(", ")} (pool holds 20000+ invoices, each silo 1 or 2)`);
  const routes = await Promise.all(["acme", "initech", "umbrella"].map(route));
  const held = await Promise.all(routes.flatMap((r) => Array.from({ length: 5 }, () => r.pool.connect())));
  const { rows: conns } = await admin.query("SELECT datname, count(*)::int AS n FROM pg_stat_activity WHERE usename = 'app' GROUP BY 1 ORDER BY 1");
  const { rows: max } = await admin.query("SHOW max_connections");
  console.log(`   app connections with 5 busy requests per tenant: ${conns.map((r) => `${r.datname} ${r.n}`).join(", ")}; max_connections ${max[0].max_connections}`);
  console.log(`   every pooled tenant shares the pool database's connections; at 5 per silo, ${Math.floor(Number(max[0].max_connections) / 5)} silo tenants fill the server`);
  for (const c of held) c.release();
  step("19. Deleting one tenant", "umbrella leaves: in a silo that is one DROP DATABASE, not a DELETE ... WHERE tenant_id on every table followed by vacuum");
  await forget("silo_umbrella");
  await admin.query("DROP DATABASE silo_umbrella");
  await shared.query("DELETE FROM tenants WHERE id = 'umbrella'");
  console.log("   DROP DATABASE silo_umbrella; directory row removed");
  console.log(`   umbrella request: rejected: ${await rejection(() => read("umbrella", (c) => c.query(counted)))}`);
  step("20. Moving a big tenant from the pool to a silo", "pause bigco's writes, copy its rows by tenant_id into a new database, verify, flip the directory, delete it from the pool");
  await shared.query("UPDATE tenants SET moving = true WHERE id = 'bigco'");
  console.log(`   directory: bigco moving = true; bigco write: rejected: ${await rejection(() => write("bigco", (c) => c.query(newInvoice, [21000])))}`);
  console.log(`   bigco read during the move: ${await where("bigco")}`);
  await admin.query("CREATE DATABASE silo_bigco");
  const target = pool("migrator", "silo_bigco");
  await target.query(SILO_SCHEMA);
  const source = await asTenant(shared, "bigco", async (c) => ({
    customers: (await c.query("SELECT id, tenant_id, name FROM customers ORDER BY id")).rows,
    invoices: (await c.query("SELECT id, tenant_id, customer_id, number, amount_cents FROM invoices ORDER BY id")).rows,
  }));
  await asTenant(target, "bigco", async (c) => {
    await c.query("INSERT INTO customers (id, tenant_id, name) SELECT * FROM unnest($1::int[], $2::text[], $3::text[])", ["id", "tenant_id", "name"].map((k) => column(source.customers, k)));
    await c.query(
      "INSERT INTO invoices (id, tenant_id, customer_id, number, amount_cents) SELECT * FROM unnest($1::int[], $2::text[], $3::int[], $4::int[], $5::int[])",
      ["id", "tenant_id", "customer_id", "number", "amount_cents"].map((k) => column(source.invoices, k)),
    );
  });
  console.log(`   copied into silo_bigco, ids kept: customers ${source.customers.length}, invoices ${source.invoices.length}`);
  const check = async (p: pg.Pool) => (await asTenant(p, "bigco", (c) => c.query(counted))).rows[0];
  const [before, after] = [await check(shared), await check(target)];
  console.log(`   verify: pool invoices ${before.n}, total ${before.total}; silo_bigco invoices ${after.n}, total ${after.total}`);
  await shared.query("UPDATE tenants SET db = 'silo_bigco', placement = 'silo', moving = false, statement_timeout_ms = 5000 WHERE id = 'bigco'");
  console.log("   directory flipped: bigco -> silo_bigco, moving = false, statement_timeout 5000ms (no neighbors left to protect)");
  for (let number = 21001; ; number++) {
    const outcome = await write("bigco", (c) => c.query(newInvoice, [number]))
      .then(({ rows }) => `ok, id ${rows[0].id}`)
      .catch((err) => `rejected: ${reason(err)}`);
    console.log(`   bigco write, invoice ${number}: ${outcome}`);
    if (outcome.startsWith("rejected")) break;
  }
  await asTenant(target, "bigco", (c) => c.query("SELECT setval(pg_get_serial_sequence('invoices', 'id'), max(id)) FROM invoices; SELECT setval(pg_get_serial_sequence('customers', 'id'), max(id)) FROM customers"));
  console.log("   the copy kept the ids but not the sequences: they restarted at 1, ids 1-3 were free, 4 was taken. setval to max(id), with the tenant set (under forced RLS max(id) is NULL otherwise)");
  const { rows: created } = await write("bigco", (c) => c.query(newInvoice, [21100]));
  console.log(`   bigco write: ok, invoice id ${created[0].id} in ${created[0].db}`);
  const deleted = await asTenant(shared, "bigco", async (c) => [(await c.query("DELETE FROM invoices")).rowCount, (await c.query("DELETE FROM customers")).rowCount]);
  console.log(`   deleted from the pool: invoices ${deleted[0]}, customers ${deleted[1]}`);
  for (const t of ["acme", "bigco"]) console.log(`   ${await where(t)}`);
  await closeAll();
}

main();
