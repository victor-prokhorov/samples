import pg from "pg";
import { check } from "./check.js";
import { asTenant, closeAll, pool, reason, rejection, step, tx } from "./db.js";
import { tenantPolicy } from "./schema.js";

const app = pool("app", "pool");
const owner = pool("migrator", "pool");
const superuser = pool("postgres", "pool");
const single = pool("app", "pool", 1);

const byTenant = "SELECT tenant_id, count(*)::int AS n FROM invoices GROUP BY 1 ORDER BY 1";

const heavyReport = "SELECT count(*)::int AS n FROM invoices a JOIN invoices b ON a.amount_cents < b.amount_cents";

async function visible(run: Promise<pg.QueryResult>) {
  const { rows } = await run;
  return rows.length ? rows.map((r) => `${r.tenant_id} ${r.n}`).join(", ") : "0 rows";
}

async function plan(tenant: string, sql: string) {
  const { rows } = await asTenant(app, tenant, (c) => c.query(`EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF) ${sql}`));
  for (const r of rows) console.log(`     ${r["QUERY PLAN"]}`);
  return rows.map((r) => String(r["QUERY PLAN"])).join("\n");
}

async function report(tenant: string) {
  const { rows } = await app.query("SELECT statement_timeout_ms FROM tenants WHERE id = $1", [tenant]);
  const ms = rows[0].statement_timeout_ms;
  const outcome = await asTenant(app, tenant, async (c) => {
    await c.query("SELECT set_config('statement_timeout', $1, true)", [String(ms)]);
    const result = await c.query(heavyReport);
    return `done, count = ${result.rows[0].n}`;
  }).catch((err) => `rejected: ${reason(err)}`);
  console.log(`   ${tenant.padEnd(6)} report (statement_timeout ${ms}ms): ${outcome}`);
  return outcome;
}

const insertInvoice = "INSERT INTO invoices (tenant_id, customer_id, number, amount_cents) VALUES ($1, $2, $3, $4)";

async function main() {
  step("1. Pool: a forgotten WHERE tenant_id", "all tenants share one invoices table; isolation is a WHERE tenant_id = $1 that every query must remember");
  const forgotten = await visible(app.query(byTenant));
  console.log(`   acme's invoice list, WHERE tenant_id forgotten: ${forgotten}`);
  check("without RLS, a query that forgets WHERE tenant_id reads every tenant's rows", forgotten === "acme 2, bigco 20000, globex 1");
  step("2. Row-Level Security", "the database adds the tenant filter to every query; the app sets app.tenant_id per transaction and the same forgotten query is now scoped");
  await owner.query(`${tenantPolicy("customers")}; ${tenantPolicy("invoices")}`);
  console.log("   policy: USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')), same expression WITH CHECK");
  const acme = await visible(asTenant(app, "acme", (c) => c.query(byTenant)));
  const globex = await visible(asTenant(app, "globex", (c) => c.query(byTenant)));
  console.log(`   acme, same query:   ${acme}`);
  console.log(`   globex, same query: ${globex}`);
  check("under RLS the same query returns only the current tenant's rows: no cross-tenant read", acme === "acme 2" && globex === "globex 1");
  step("3. No tenant set: zero rows, not an error", "current_setting(..., true) returns NULL when the setting is missing, tenant_id = NULL is never true, so the policy fails closed and silently");
  const none = await visible(single.query(byTenant));
  console.log(`   no tenant set: ${none}`);
  const strict = await rejection(() => single.query("SELECT current_setting('app.tenant_id')"));
  console.log(`   strict current_setting on a fresh connection: rejected: ${strict}`);
  check("with no tenant set the policy fails closed: 0 rows, no error", none === "0 rows" && strict.includes("unrecognized configuration parameter"));
  await asTenant(single, "acme", (c) => c.query("SELECT 1"));
  const { rows: after } = await single.query("SELECT current_setting('app.tenant_id') AS v");
  console.log(`   same connection after one request with SET LOCAL: current_setting('app.tenant_id') = ${JSON.stringify(after[0].v)} (hence NULLIF(..., ''))`);
  check("after SET LOCAL ends, the setting is '' rather than missing", after[0].v === "");
  step("4. The owner and superusers bypass RLS", "ENABLE ROW LEVEL SECURITY does not apply to the table owner, superusers or BYPASSRLS roles; FORCE fixes the owner, nothing fixes a superuser");
  const ownerBefore = await visible(owner.query(byTenant));
  const superBefore = await visible(superuser.query(byTenant));
  console.log(`   migrator (owner), no tenant set:  ${ownerBefore}`);
  console.log(`   postgres (superuser):             ${superBefore}`);
  await owner.query("ALTER TABLE customers FORCE ROW LEVEL SECURITY; ALTER TABLE invoices FORCE ROW LEVEL SECURITY");
  console.log("   ALTER TABLE ... FORCE ROW LEVEL SECURITY");
  const ownerAfter = await visible(owner.query(byTenant));
  const superAfter = await visible(superuser.query(byTenant));
  console.log(`   migrator (owner), no tenant set:  ${ownerAfter}`);
  console.log(`   postgres (superuser):             ${superAfter}`);
  check("the owner bypasses RLS until FORCE; the superuser bypasses it always", ownerBefore === "acme 2, bigco 20000, globex 1" && ownerAfter === "0 rows" && superBefore === "acme 2, bigco 20000, globex 1" && superAfter === "acme 2, bigco 20000, globex 1");
  step("5. SET vs SET LOCAL on a pooled connection", "pool of 1 connection: a session-level SET outlives the request and the next request on that connection inherits the tenant");
  await single.query("SELECT set_config('app.tenant_id', 'acme', false)");
  console.log("   request 1 (acme): SET app.tenant_id = 'acme' (session level), connection back to the pool");
  const leaked = await visible(single.query(byTenant));
  console.log(`   request 2 (globex job, forgot to set the tenant): ${leaked}`);
  check("a session-level SET leaks acme's tenant into the next request on the pooled connection", leaked === "acme 2");
  await single.query("RESET app.tenant_id");
  await asTenant(single, "acme", (c) => c.query(byTenant));
  console.log("   after RESET, request 1 (acme): set_config('app.tenant_id', 'acme', true) = SET LOCAL, ends with the transaction");
  const clean = await visible(single.query(byTenant));
  console.log(`   request 2 (globex job, forgot to set the tenant): ${clean}`);
  check("SET LOCAL ends with the transaction: the next request sees 0 rows", clean === "0 rows");
  console.log(`   SET LOCAL with a bind parameter: rejected: ${await rejection(() => single.query("SET LOCAL app.tenant_id = $1", ["acme"]))}`);
  step("6. WITH CHECK blocks writes into another tenant", "USING filters the rows a tenant can see; WITH CHECK rejects new or updated rows that would belong to someone else");
  const foreignInsert = await rejection(() => asTenant(app, "acme", (c) => c.query(insertInvoice, ["globex", 2, 50, 100])));
  console.log(`   acme inserts a row with tenant_id 'globex': rejected: ${foreignInsert}`);
  const move = await rejection(() => asTenant(app, "acme", (c) => c.query("UPDATE invoices SET tenant_id = 'globex' WHERE number = 1")));
  console.log(`   acme moves its invoice 1 to globex: rejected: ${move}`);
  const hidden = await asTenant(app, "acme", (c) => c.query("UPDATE invoices SET amount_cents = 0 WHERE number = 100"));
  console.log(`   acme updates globex's invoice 100: ${hidden.rowCount} rows updated (invisible, not an error)`);
  check("WITH CHECK rejects writing a row into another tenant, by INSERT or UPDATE", [foreignInsert, move].every((m) => m.includes("violates row-level security policy")));
  check("acme cannot update globex's invoice: 0 rows touched", hidden.rowCount === 0);
  step("7. Indexes lead with tenant_id", "RLS is a filter, not a partition: without an index starting with tenant_id, acme's query walks past everyone else's rows");
  const latest = "SELECT id, number FROM invoices ORDER BY id DESC LIMIT 5";
  console.log(`   acme: ${latest}`);
  const scan = await plan("acme", latest);
  await owner.query("CREATE INDEX invoices_tenant_id_id_idx ON invoices (tenant_id, id); ANALYZE invoices");
  console.log("   CREATE INDEX ON invoices (tenant_id, id)");
  const indexed = await plan("acme", latest);
  check("without a tenant_id index acme's query filters out every other tenant's rows; with one it reads only its own", /Rows Removed by Filter: 2000\d/.test(scan) && indexed.includes("invoices_tenant_id_id_idx") && !indexed.includes("Rows Removed"));
  step("8. Unique constraints must include tenant_id", "UNIQUE (number) is global: globex cannot have its own invoice 1, and the rejection tells globex another tenant has one (under RLS Postgres hides the key value, not the fact)");
  const global = await rejection(() => asTenant(app, "globex", (c) => c.query(insertInvoice, ["globex", 2, 1, 500])));
  console.log(`   globex creates invoice 1: rejected: ${global}`);
  check("a global UNIQUE (number) stops globex having its own invoice 1", global.includes("invoices_number_key"));
  await owner.query("ALTER TABLE invoices DROP CONSTRAINT invoices_number_key, ADD CONSTRAINT invoices_tenant_id_number_key UNIQUE (tenant_id, number)");
  console.log("   ALTER TABLE invoices ... ADD UNIQUE (tenant_id, number)");
  await asTenant(app, "globex", (c) => c.query(insertInvoice, ["globex", 2, 1, 500]));
  console.log("   globex creates invoice 1: ok, acme and globex both have an invoice 1");
  const ones = await superuser.query("SELECT string_agg(tenant_id, ',' ORDER BY tenant_id) AS t FROM invoices WHERE number = 1");
  check("with UNIQUE (tenant_id, number) acme and globex both have an invoice 1", ones.rows[0].t === "acme,globex");
  step("9. Foreign keys must include tenant_id", "foreign key checks bypass RLS, so a plain FOREIGN KEY (customer_id) accepts another tenant's customer; and adding a constraint validates only the rows the migrating role can see");
  await asTenant(app, "acme", (c) => c.query(insertInvoice, ["acme", 2, 3, 700]));
  console.log("   acme creates invoice 3 for customer 2 (globex's Grace): accepted");
  const composite = "ALTER TABLE invoices ADD CONSTRAINT invoices_customer_fkey FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id)";
  await owner.query("ALTER TABLE customers ADD CONSTRAINT customers_tenant_id_id_key UNIQUE (tenant_id, id); ALTER TABLE invoices DROP CONSTRAINT invoices_customer_id_fkey");
  await owner.query(composite);
  const { rows: bad } = await superuser.query("SELECT count(*)::int AS n FROM invoices i WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.tenant_id = i.tenant_id AND c.id = i.customer_id)");
  const { rows: valid } = await superuser.query("SELECT convalidated FROM pg_constraint WHERE conname = 'invoices_customer_fkey'");
  console.log(`   migrator (owner, forced RLS) adds FOREIGN KEY (tenant_id, customer_id): accepted, convalidated = ${valid[0].convalidated}, rows violating it: ${bad[0].n}`);
  console.log("   the validation query ran under RLS with no tenant set, saw zero rows, and found nothing wrong");
  check("a plain foreign key let acme point at globex's customer, and the owner's validation under RLS missed it", valid[0].convalidated === true && bad[0].n === 1);
  await owner.query("ALTER TABLE invoices DROP CONSTRAINT invoices_customer_fkey");
  const loud = await rejection(() => tx(owner, async (c) => {
    await c.query("SET LOCAL row_security = off");
    await c.query(composite);
  }));
  console.log(`   same, with SET row_security = off: rejected: ${loud}`);
  const asSuper = await rejection(() => superuser.query(composite));
  console.log(`   same, as postgres (bypasses RLS): rejected: ${asSuper}`);
  check("with row_security = off or as a superuser, validation sees the bad row and refuses", loud.includes("would be affected by row-level security") && asSuper.includes("violates foreign key constraint"));
  await asTenant(owner, "acme", (c) => c.query("DELETE FROM invoices WHERE number = 3"));
  await superuser.query(composite);
  console.log("   deleted the cross-tenant row, then added the composite foreign key as postgres");
  const composed = await rejection(() => asTenant(app, "acme", (c) => c.query(insertInvoice, ["acme", 2, 3, 700])));
  console.log(`   acme creates invoice 3 for customer 2 again: rejected: ${composed}`);
  check("the composite foreign key refuses another tenant's customer", composed.includes("invoices_customer_fkey"));
  step("10. Noisy neighbor: a per-tenant statement_timeout", "one database serves every tenant, so one tenant's heavy query takes CPU from all; each tenant's limit comes from the directory");
  const small = await report("acme");
  const big = await report("bigco");
  check("acme's report finishes within its 5000ms; bigco's is cancelled at its 200ms", small.startsWith("done") && big.includes("statement timeout"));
  await closeAll();
}

main();
