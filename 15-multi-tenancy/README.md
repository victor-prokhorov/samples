# 15. Multi-tenancy: pool, bridge, silo

**Pain: one tenant sees another's data.** A SaaS database holds many customers. One forgotten `WHERE tenant_id`, one pooled connection that kept the previous request's tenant, or one foreign key that points across tenants, and a customer reads or writes someone else's rows. One big tenant can also slow everyone down.

**Reach for it when** many customers share one product and one codebase, and you have to choose, per tenant, how strongly their data is separated: pool (shared tables, `tenant_id`, Row-Level Security) for many small tenants, bridge (a schema per tenant) for tens to a few hundred, silo (a database per tenant) for the few that need their own restore, deletion, region or capacity.

**Do not reach for it when** there is one customer, or tenants never share infrastructure (one deployment per customer is a silo without the router). You need isolation against a compromised database superuser or a noisy host: only separate servers or accounts give that. You want RLS as the only guard with the app connecting as the table owner or a superuser: it filters nothing for them.

Three isolation models on one Postgres, named as in the AWS SaaS whitepapers: pool, bridge, silo, each pitfall shown failing and then fixed. `src/demo.ts` starts the pool with a naive first schema and repairs it step by step; `src/bridge.ts` runs schema-per-tenant with a migration loop; `src/silo.ts` routes tenants to their own databases and moves the biggest pooled tenant into one. Three roles: `postgres` (superuser), `migrator` (owns every table) and `app` (not owner, not superuser, no `BYPASSRLS`), which is what the application uses.

## Run

One shot with proof: `./run-15-multi-tenancy.sh` from the repo root (log in [`../logs/15-multi-tenancy.log`](../logs/15-multi-tenancy.log)).

Each claim in the Proof section below is also a `check(label, condition)` in the code. A failed check marks the process failed, so the script exits non-zero; the log ends each process with `N checks passed` or `FAILED: ...`.

By hand, from this folder (ports: Postgres 55447):

```sh
docker compose up -d --wait
npm i
npm run setup    # roles migrator (owner) and app (not owner, no BYPASSRLS); databases pool, bridge, silo_initech, silo_umbrella
npm run demo     # pool: forgotten WHERE, RLS, missing tenant, owner bypass, SET vs SET LOCAL, WITH CHECK, indexes, unique, foreign keys, statement_timeout
npm run bridge   # bridge: search_path + per-tenant role, pooled leak, migration loop half done, catalog bloat at 1003 schemas
npm run silo     # silo: routing, no cross-database reads, cost, DROP DATABASE per tenant, moving bigco from the pool to its own database
```

## Files

- `src/db.ts` pools per role, `tx()`, and `asTenant()`, which sets `app.tenant_id` with `set_config(..., true)` (the bindable `SET LOCAL`).
- `src/schema.ts` the RLS policy and the fixed schema every silo starts from.
- `src/router.ts` reads the `tenants` directory on every call, opens one pool per database, and refuses writes while a tenant is moving.

## Concepts

- **Pool**: one set of tables, a `tenant_id` on every row. Cheapest and simplest to run (one schema, one migration, one backup), but isolation is a `WHERE tenant_id = $1` every query must remember. Step 1's query forgot it and returned all three tenants' rows.
- **Row-Level Security**: `ENABLE ROW LEVEL SECURITY` plus a policy `USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))`. Postgres adds that filter to every query on the table, so the forgotten `WHERE` is scoped. The app sets `app.tenant_id` at the start of each transaction (`asTenant()` in `src/db.ts`).
- **Who RLS does not apply to**: superusers and `BYPASSRLS` roles always bypass it, and so does the table owner unless the table is `FORCE ROW LEVEL SECURITY`. Before `FORCE`, the owner saw all 20003 rows; after it, zero. The superuser still saw everything. So the app must connect as a role that is none of the three (`app` here).
- **Missing tenant = zero rows, silently**: `current_setting(name, true)` returns NULL for an unknown setting. `tenant_id = NULL` is never true, so the policy fails closed without an error. The strict form `current_setting(name)` errors on a fresh connection. On a connection that has ever set the value, it returns `''` rather than an error, hence the `NULLIF`. If a missing tenant must be loud, check it in the app (or in a policy function that raises); do not count on the setting being absent.
- **`SET` vs `SET LOCAL` on pooled connections**: a session-level `SET app.tenant_id` stays on the connection after the request. With a pool of one connection, the next request that forgot to set a tenant got acme's rows. `SET LOCAL` (or `set_config(name, value, true)`) ends with the transaction. `SET LOCAL` cannot take a bind parameter (`syntax error at or near "$1"`), so use `set_config` rather than concatenating the tenant id into SQL. Under PgBouncer transaction pooling a session `SET` also lands on whichever server connection the next statement gets.
- **`WITH CHECK`**: `USING` decides which rows are visible, `WITH CHECK` which rows may be written. acme could not insert a row for globex or move its own invoice to globex (`new row violates row-level security policy`). An update aimed at globex's invoice matched 0 rows, which is not an error.
- **Indexes lead with `tenant_id`**: RLS is a filter, not a partition. Without an index starting with `tenant_id`, acme's "latest 5 invoices" scanned the table and threw away bigco's 20000 rows (`Rows Removed by Filter: 20001`). With `(tenant_id, id)` it is one index range. The policy's `current_setting` is stable, so it can be an index condition.
- **Unique constraints include `tenant_id`**: `UNIQUE (number)` is global, so globex could not have its own invoice 1. The rejection is also a covert channel: it tells globex that another tenant has invoice 1 (under RLS Postgres hides the key value, not the fact). `UNIQUE (tenant_id, number)` fixes both.
- **Foreign keys include `tenant_id`**: referential integrity checks bypass RLS by design. So with a plain `FOREIGN KEY (customer_id)`, acme's invoice could point at globex's customer. The fix is `UNIQUE (tenant_id, id)` on the parent and `FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id)`.
- **Migrating under forced RLS**: the owner added that foreign key under forced RLS with no tenant set. The validation query saw zero rows, and the constraint was marked valid with a violating row still in the table. Run migrations as a role that bypasses RLS, or with `SET row_security = off`, which turns "policy would filter" into an error. As `postgres`, the same statement was rejected and named the bad row.
- **Noisy neighbor**: one database means one CPU budget. Each tenant's `statement_timeout` comes from the `tenants` directory and is set per transaction (`set_config('statement_timeout', ..., true)`). bigco's self-join report was cancelled at 200 ms; acme's ran. A timeout caps one query, not the load. The other levers are per-tenant connection caps and rate limits in the app, or moving the tenant out (step 20).
- **Bridge, schema per tenant**: one database, one schema per tenant with the same table names. Each request sets `search_path` and `role` LOCAL. The tables are physically separate, so they can be dumped or dropped per tenant and even vary per tenant.
- **`search_path` is not a security boundary**: a schema-qualified name ignores it. One shared role with `search_path = t_hooli` read `t_initrode.invoices`. Only privileges stop that, so each tenant gets its own role, and `app` has no privileges of its own. The pooled-connection leak applies here too: a session-level `SET ROLE` / `SET search_path` made the next request run as hooli. With LOCAL settings, a request that forgot its context failed loudly (`relation "invoices" does not exist`) where RLS returns zero rows.
- **Migrations run N times**: every schema change loops over every schema, one transaction per schema, each recording its version. Tenant data differs, so one schema can fail (initrode had a duplicate invoice number). That leaves the fleet half migrated (hooli at 2, initrode and vandelay at 1), and the app must work with both shapes until the loop finishes. The loop must be resumable: the second run skipped hooli.
- **Catalog bloat**: every schema copies every table, index and sequence into the system catalogs. With 1003 tenants `pg_class` went from 437 to 8437 rows and the catalogs from 7.6 MB to 25 MB. The `bridge` database ended at 80 MB with almost no data. One migration over 1000 schemas took a few seconds; at tens of thousands, the catalog cache per connection, `pg_dump` and every migration slow down.
- **Silo, database per tenant**: the strongest isolation Postgres offers short of separate servers. A connection is bound to one database (`cross-database references are not implemented`). Restore, deletion, extensions and `pg_dump` are per tenant: the run restores `silo_initech` alone, and deletes umbrella with one `DROP DATABASE` instead of `DELETE ... WHERE tenant_id` on every table plus vacuum and backups that still hold the rows. For stronger isolation still, revoke `CONNECT` from `PUBLIC` and give each silo its own login role.
- **What a silo costs**: an empty silo is about 7.6 MB of catalogs, and connections are per database. With 5 busy requests per tenant, each silo held 5 connections of `max_connections = 100`, so about 20 silo tenants fill the server, while pooled tenants share one pool. Silos also need a router: `src/router.ts` reads the `tenants` directory on every call.
- **Moving a tenant from the pool to a silo**: set `moving` in the directory (writes refused, reads still served), create the database with the pool's final schema, copy the rows by `tenant_id` keeping their ids, verify count and sum, flip the directory, delete the tenant from the pool. The trap: the copy kept the ids but not the sequences. The first three writes after the flip got the free ids 1 to 3, and the fourth hit `invoices_pkey`. `setval` to `max(id)` fixes it, run with the tenant set, because under forced RLS `max(id)` is NULL otherwise. Deliberately simplified: a write that read `moving = false` just before the flag flipped can still commit during the copy. Take the directory row `FOR SHARE` in each pool write transaction so the mover waits for writes already in flight. Real routers also cache the directory, so a flip must wait out the cache.

## Proof (`logs/15-multi-tenancy.log`)

The forgotten `WHERE` leaks, RLS scopes the same query, and the owner and the superuser bypass it until `FORCE`, which only binds the owner:

```
   acme's invoice list, WHERE tenant_id forgotten: acme 2, bigco 20000, globex 1
   acme, same query:   acme 2
   no tenant set: 0 rows
   same connection after one request with SET LOCAL: current_setting('app.tenant_id') = "" (hence NULLIF(..., ''))

   migrator (owner), no tenant set:  acme 2, bigco 20000, globex 1
   postgres (superuser):             acme 2, bigco 20000, globex 1
   ALTER TABLE ... FORCE ROW LEVEL SECURITY
   migrator (owner), no tenant set:  0 rows
   postgres (superuser):             acme 2, bigco 20000, globex 1
```

A session-level `SET` on a pooled connection hands acme's tenant to the next request; `SET LOCAL` does not:

```
   request 1 (acme): SET app.tenant_id = 'acme' (session level), connection back to the pool
   request 2 (globex job, forgot to set the tenant): acme 2
   after RESET, request 1 (acme): set_config('app.tenant_id', 'acme', true) = SET LOCAL, ends with the transaction
   request 2 (globex job, forgot to set the tenant): 0 rows
   SET LOCAL with a bind parameter: rejected: syntax error at or near "$1"
```

Keys and indexes that do not lead with `tenant_id`, and a foreign key "validated" by a role that could see nothing (abridged):

```
             ->  Seq Scan on invoices (actual rows=2 loops=1)
                   Rows Removed by Filter: 20001
   CREATE INDEX ON invoices (tenant_id, id)
       ->  Index Scan Backward using invoices_tenant_id_id_idx on invoices (actual rows=2 loops=1)

   globex creates invoice 1: rejected: duplicate key value violates unique constraint "invoices_number_key"

   acme creates invoice 3 for customer 2 (globex's Grace): accepted
   migrator (owner, forced RLS) adds FOREIGN KEY (tenant_id, customer_id): accepted, convalidated = true, rows violating it: 1
   same, with SET row_security = off: rejected: query would be affected by row-level security policy for table "invoices"
   same, as postgres (bypasses RLS): rejected: insert or update on table "invoices" violates foreign key constraint "invoices_customer_fkey" (Key (tenant_id, customer_id)=(acme, 2) is not present in table "customers".)
```

Per-tenant timeout from the directory:

```
   acme   report (statement_timeout 5000ms): done, count = 1
   bigco  report (statement_timeout 200ms): rejected: canceling statement due to statement timeout
```

Bridge: `search_path` alone is no boundary, the pooled leak, a half-migrated fleet, and the catalogs at 1003 schemas:

```
   one shared role, search_path t_hooli, SELECT FROM t_initrode.invoices: 2 rows of initrode's
   role tenant_hooli, same query: rejected: permission denied for schema t_initrode
   request 2 (initrode, forgot the context): runs as tenant_hooli, sees 2 invoices (hooli's)

     t_hooli: migrated to 2
     t_initrode: failed: could not create unique index "invoices_number_key" (Key (number)=(1) is duplicated.); loop stopped
   versions now: t_hooli 2, t_initrode 1, t_vandelay 1; the app must handle both shapes until every schema is done

   3 tenants                        3 tenant schemas, pg_class 437 rows, pg_attribute 3228 rows, system catalogs 7776 kB
   1003 tenants, after migration 2  1003 tenant schemas, pg_class 8437 rows, pg_attribute 43228 rows, system catalogs 25 MB
```

Silo: no path between databases, the cost in connections, and bigco's move with the sequence trap:

```
   initech's connection reads silo_umbrella.public.invoices: rejected: cross-database references are not implemented: "silo_umbrella.public.invoices"
   app connections with 5 busy requests per tenant: pool 5, silo_initech 5, silo_umbrella 5; max_connections 100

   directory: bigco moving = true; bigco write: rejected: bigco is being moved: writes paused, reads still served by pool
   verify: pool invoices 20000, total 49990000; silo_bigco invoices 20000, total 49990000
   bigco write, invoice 21003: ok, id 3
   bigco write, invoice 21004: rejected: duplicate key value violates unique constraint "invoices_pkey"
   bigco write: ok, invoice id 20004 in silo_bigco
   bigco    -> silo_bigco: invoices 20004, total 49990400
```

The self-checks, one line per claim, then one summary per process; any failed check makes the run script exit non-zero:

```
   check ok: without RLS, a query that forgets WHERE tenant_id reads every tenant's rows
   check ok: under RLS the same query returns only the current tenant's rows: no cross-tenant read
   check ok: with no tenant set the policy fails closed: 0 rows, no error
   check ok: after SET LOCAL ends, the setting is '' rather than missing
   check ok: the owner bypasses RLS until FORCE; the superuser bypasses it always
   check ok: a session-level SET leaks acme's tenant into the next request on the pooled connection
   check ok: SET LOCAL ends with the transaction: the next request sees 0 rows
   check ok: WITH CHECK rejects writing a row into another tenant, by INSERT or UPDATE
   check ok: acme cannot update globex's invoice: 0 rows touched
   check ok: without a tenant_id index acme's query filters out every other tenant's rows; with one it reads only its own
   check ok: a global UNIQUE (number) stops globex having its own invoice 1
   check ok: with UNIQUE (tenant_id, number) acme and globex both have an invoice 1
   check ok: a plain foreign key let acme point at globex's customer, and the owner's validation under RLS missed it
   check ok: with row_security = off or as a superuser, validation sees the bad row and refuses
   check ok: the composite foreign key refuses another tenant's customer
   check ok: acme's report finishes within its 5000ms; bigco's is cancelled at its 200ms
16 checks passed
   check ok: each request runs as its tenant's role, in its tenant's schema
   check ok: a schema-qualified name reaches another tenant under one shared role; the tenant's own role is denied
   check ok: session-level role and search_path leak hooli's context into the next request
   check ok: with LOCAL settings and DISCARD ALL, a request without context fails loudly
   check ok: one schema's data stops the loop: the fleet is left half migrated
   check ok: after the fix the re-run skips done schemas and migrates the rest
   check ok: every tenant schema adds relations to the catalog: pg_class grew by 8000 for 1000 tenants
7 checks passed
   check ok: the directory routes pooled tenants to pool and siloed ones to their own database
   check ok: a silo connection cannot read another tenant's database
   check ok: connections are per database: 5 busy requests per tenant hold 5 connections in each database
   check ok: deleting umbrella is one DROP DATABASE: the database and the directory row are gone
   check ok: while bigco moves its writes are refused
   check ok: the copy in silo_bigco has the same invoice count and total as the pool
   check ok: the copied ids without their sequences collide on the 4th new invoice
   check ok: after setval, new invoices continue after the copied ids, in silo_bigco
   check ok: bigco now lives only in silo_bigco; acme still in the pool
9 checks passed
```

## Origins and further reading

- Docs: "Row Security Policies", PostgreSQL documentation (owner and superuser bypass, `FORCE`, and referential integrity checks bypassing row security, with the covert-channel warning). https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Docs: `row_security`, "Client Connection Defaults", PostgreSQL documentation. https://www.postgresql.org/docs/current/runtime-config-client.html
- Whitepaper: "SaaS Tenant Isolation Strategies: Isolating Resources in a Multi-Tenant Environment", AWS (silo, pool, and bridge as a mix of the two). https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/saas-tenant-isolation-strategies.html
- Whitepaper: "SaaS Storage Strategies", AWS, archived (silo, bridge and pool for data; bridge as separate tables or schemas per tenant in one database). https://docs.aws.amazon.com/whitepapers/latest/multi-tenant-saas-storage-strategies/saas-partitioning-models.html
- Guide: "Architectural approaches for storage and data in multitenant solutions", Azure Architecture Center (noisy neighbors, per-tenant schema versions, restore and offboarding). https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/storage-data
- Guide: "Multi-tenant Applications", Citus documentation (tenant id in every primary and foreign key). https://docs.citusdata.com/en/stable/use_cases/multi_tenant.html
