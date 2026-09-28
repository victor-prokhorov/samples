# 16-multi-tenancy

**Pain: one tenant sees another's data.** A SaaS database holds many customers. One forgotten `WHERE tenant_id`, one pooled connection that kept the previous request's tenant, or one foreign key that points across tenants, and a customer reads or writes someone else's rows. One big tenant can also slow everyone down.

**Reach for it when** many customers share one product and one codebase, and you have to choose, per tenant, how strongly their data is separated: pool (shared tables, `tenant_id`, Row-Level Security) for many small tenants, bridge (a schema per tenant) for tens to a few hundred, silo (a database per tenant) for the few that need their own restore, deletion, region or capacity.

**Do not reach for it when** there is one customer, or tenants never share infrastructure (one deployment per customer is a silo without the router). You need isolation against a compromised database superuser or a noisy host: only separate servers or accounts give that. You want RLS as the only guard with the app connecting as the table owner or a superuser: it filters nothing for them.

Three models on one Postgres (named as in the AWS SaaS whitepapers: pool, bridge, silo), each pitfall shown failing and then fixed. `src/demo.ts` starts the pool with a naive first schema and repairs it step by step; `src/bridge.ts` runs schema-per-tenant with a migration loop; `src/silo.ts` routes tenants to their own databases and moves the biggest pooled tenant into one.

```sh
docker compose up -d --wait
npm i
npm run setup    # roles migrator (owner) and app (not owner, no BYPASSRLS); databases pool, bridge, silo_initech, silo_umbrella
npm run demo     # pool: forgotten WHERE, RLS, missing tenant, owner bypass, SET vs SET LOCAL, WITH CHECK, indexes, unique, foreign keys, statement_timeout
npm run bridge   # bridge: search_path + per-tenant role, pooled leak, migration loop half done, catalog bloat at 1003 schemas
npm run silo     # silo: routing, no cross-database reads, cost, DROP DATABASE per tenant, moving bigco from the pool to its own database
```

- `src/db.ts` pools per role, `tx()`, and `asTenant()`, which sets `app.tenant_id` with `set_config(..., true)` (the bindable `SET LOCAL`).
- `src/schema.ts` the RLS policy and the fixed schema every silo starts from.
- `src/router.ts` reads the `tenants` directory on every call, opens one pool per database, and refuses writes while a tenant is moving.

One-shot run with proof: `../run-16-multi-tenancy.sh` (log in `../logs/16-multi-tenancy.log`). Concepts explained in `../README.md`.
