# samples

Thirty-two minimal, real TypeScript examples. The first nineteen show how to change and run a live system without breaking it: tracking change, evolving schemas, replacing code, calling services that fail, serving files over HTTP with ETags, coordinating services, publishing events, splitting data across servers, isolating tenants, keeping invariants under concurrency, auditing across services, erasing personal data and electing a leader. The next thirteen show how to build, test and run a product on top: a full-stack portal, accessible forms, end-to-end tests, executable specifications, recovering legacy rules, two languages, single sign-on, data imports, batch campaigns, KPIs, a CI/CD pipeline, runbooks and a worked design case. They are numbered by complexity: read them in order, each one assumes the concepts of the ones before it. For the wider landscape (who coined what, and which books to read) see [MIGRATION-PATTERNS.md](MIGRATION-PATTERNS.md). For a worked design case that ties them together (discovery, journeys, multi-tenancy, security, accessibility, a PDF pipeline, integrations and migration, with diagrams) see [design-exercise/](design-exercise/).

| # | Folder | Pain | New concepts | Infra | Run | Proof |
| --- | --- | --- | --- | --- | --- | --- |
| | **Changing a system safely** | | | | | |
| 01 | [`01-crud-audit/`](01-crud-audit/) | lost history | transactions, before/after audit rows | Postgres | `./run-01-crud-audit.sh` | [`logs/01-crud-audit.log`](logs/01-crud-audit.log) |
| 02 | [`02-expand-contract/`](02-expand-contract/) | deploy breakage | zero-downtime schema change, rolling deploys, backfill | Postgres | `./run-02-expand-contract.sh` | [`logs/02-expand-contract.log`](logs/02-expand-contract.log) |
| 03 | [`03-event-sourcing/`](03-event-sourcing/) | lost business history | events as source of truth, fold, optimistic concurrency, projections | Postgres | `./run-03-event-sourcing.sh` | [`logs/03-event-sourcing.log`](logs/03-event-sourcing.log) |
| 04 | [`04-parallel-run/`](04-parallel-run/) | blind rewrite | control vs candidate, mismatch reporting, cutover | none | `./run-04-parallel-run.sh` | [`logs/04-parallel-run.log`](logs/04-parallel-run.log) |
| 05 | [`05-strangler-fig/`](05-strangler-fig/) | big-bang cutover | routing facade, capability-by-capability replacement, instant rollback | none (3 HTTP servers) | `./run-05-strangler-fig.sh` | [`logs/05-strangler-fig.log`](logs/05-strangler-fig.log) |
| | **Services and APIs** | | | | | |
| 06 | [`06-service-reliability/`](06-service-reliability/) | cascading failure | timeouts, deadline propagation, bulkhead, retryable vs not, full jitter, retry budget, idempotency keys, circuit breaker | Postgres, 2 HTTP processes | `./run-06-service-reliability.sh` | [`logs/06-service-reliability.log`](logs/06-service-reliability.log) |
| 07 | [`07-file-upload/`](07-file-upload/) | lost updates, duplicate creates, torn downloads | two-step upload, bearer scope, idempotency key, ETag as version, `If-Match` and 428/412, `If-None-Match` 304, `Range` / `If-Range` 206/416, change feed on `pg_snapshot_xmin`, `Link` cursor | Postgres, Express | `./run-07-file-upload.sh` | [`logs/07-file-upload.log`](logs/07-file-upload.log) |
| | **Coordinating services and publishing events** | | | | | |
| 08 | [`08-saga/`](08-saga/) | partial failure | no distributed transactions, compensations, saga log, crash recovery, idempotent steps, durable timer and waker | Postgres (4 databases) | `./run-08-saga.sh` | [`logs/08-saga.log`](logs/08-saga.log) |
| 09 | [`09-outbox-polling/`](09-outbox-polling/) | dual write | dual-write problem, outbox table, polling relay, `SKIP LOCKED`, at-least-once, idempotent consumer | Postgres, Kafka | `./run-09-outbox-polling.sh` | [`logs/09-outbox-polling.log`](logs/09-outbox-polling.log) |
| 10 | [`10-cdc-debezium/`](10-cdc-debezium/) | derived data drift | WAL, logical decoding, replication slot, LSN, Debezium, Kafka Connect | Postgres, Kafka, Connect | `./run-10-cdc-debezium.sh` | [`logs/10-cdc-debezium.log`](logs/10-cdc-debezium.log) |
| 11 | [`11-outbox-debezium/`](11-outbox-debezium/) | polling overhead | outbox relayed by CDC, EventRouter, immediate cleanup | Postgres, Kafka, Connect | `./run-11-outbox-debezium.sh` | [`logs/11-outbox-debezium.log`](logs/11-outbox-debezium.log) |
| 12 | [`12-choreographed-saga/`](12-choreographed-saga/) | one coordinator owns every reaction | choreography, per-service outbox + relay, idempotent consumer (`processed_messages`), offset commit vs redelivery, partition by order id, cross-topic reordering, forward-only state machine, correlation and causation ids, cyclic dependencies | Postgres (4 databases), Kafka | `./run-12-choreographed-saga.sh` | [`logs/12-choreographed-saga.log`](logs/12-choreographed-saga.log) |
| | **Scaling, isolating and protecting data** | | | | | |
| 13 | [`13-partitioning/`](13-partitioning/) | table too big | declarative partitioning, partition key, pruning, unique-key limit | Postgres | `./run-13-partitioning.sh` | [`logs/13-partitioning.log`](logs/13-partitioning.log) |
| 14 | [`14-sharding-replicas/`](14-sharding-replicas/) | one-machine ceiling | shard key, app-side router, streaming replication, read replicas, replica lag, CP writes / AP reads | Postgres (2 primaries + scalable replicas) | `./run-14-sharding-replicas.sh` | [`logs/14-sharding-replicas.log`](logs/14-sharding-replicas.log) |
| 15 | [`15-multi-tenancy/`](15-multi-tenancy/) | one tenant sees another's data | pool / bridge / silo, Row-Level Security, `FORCE`, `SET LOCAL` on pooled connections, tenant-leading keys and indexes, per-tenant migrations, per-tenant `statement_timeout`, moving a tenant to its own database | Postgres (5 databases) | `./run-15-multi-tenancy.sh` | [`logs/15-multi-tenancy.log`](logs/15-multi-tenancy.log) |
| 16 | [`16-serializable/`](16-serializable/) | write skew | isolation levels, lost update, write skew, SSI, 40001 retry, materialized conflict | Postgres | `./run-16-serializable.sh` | [`logs/16-serializable.log`](logs/16-serializable.log) |
| | **Audit, erasure and singletons** | | | | | |
| 17 | [`17-audit-outbox/`](17-audit-outbox/) | scattered audit logs | audit events through per-service outboxes, shipper, dedupe by `event_id`, append-only store, the bypass gap | Postgres (3 databases) | `./run-17-audit-outbox.sh` | [`logs/17-audit-outbox.log`](logs/17-audit-outbox.log) |
| 18 | [`18-crypto-shredding/`](18-crypto-shredding/) | erasure versus immutable data | per-subject DEK, envelope encryption (KEK), AES-256-GCM, unique IV, AAD, blind index, KEK rotation, key-store backups undo erasure | Postgres (3 databases, plus 2 restored backups) | `./run-18-crypto-shredding.sh` | [`logs/18-crypto-shredding.log`](logs/18-crypto-shredding.log) |
| 19 | [`19-leader-election/`](19-leader-election/) | a job that fires N times, or a single point of failure | lease row on the database clock, heartbeat, terms, failover after the TTL, self-fencing, fencing tokens, graceful release, `pg_try_advisory_lock` and its pooler trap | Postgres | `./run-19-leader-election.sh` | [`logs/19-leader-election.log`](logs/19-leader-election.log) |
| | **Building, testing and running a product** | | | | | |
| 20 | [`20-portal/`](20-portal/) | pages that need JS, client-only validation, one member seeing another's data | server components, server actions, progressive enhancement, `useActionState`, zod field errors, Post/Redirect/Get (303), signed session cookie, member-scoped queries (404 not 403), partial unique index as a rule, action `Origin` check | Postgres, Next.js | `./run-20-portal.sh` | [`logs/20-portal.log`](logs/20-portal.log) |
| 21 | [`21-accessibility/`](21-accessibility/) | a form keyboard and screen reader users cannot complete | WCAG 2.2 AA and RGAA criteria, axe-core in Chromium, accessible name and description, `aria-describedby` / `aria-invalid`, error summary with focus, keyboard journey, fieldset and legend, `autocomplete` tokens, what automated rules miss | none (`node:http`, Chromium via Playwright) | `./run-21-accessibility.sh` | [`logs/21-accessibility.log`](logs/21-accessibility.log) |
| 22 | [`22-playwright/`](22-playwright/) | flaky, brittle, order-dependent browser tests | role and label locators, auto-waiting and web-first assertions vs `waitForTimeout`, database per worker from a template, truncate reset (why not a rollback), `storageState` login once, trace on failure, JSON reports, Vitest for the rule | Postgres (a database per worker), Chromium via Playwright | `./run-22-playwright.sh` | [`logs/22-playwright.log`](logs/22-playwright.log) |
| 23 | [`23-specs/`](23-specs/) | acceptance criteria that nobody runs | Gherkin `Rule` per requirement, scenario outlines on boundaries, step definitions on a domain + Postgres, fixed clock, failing first against a naive implementation, Cucumber messages, traceability matrix | Postgres | `./run-23-specs.sh` | [`logs/23-specs.log`](logs/23-specs.log) |
| 24 | [`24-characterization/`](24-characterization/) | rewriting rules nobody can state | characterization test, golden master in an approval file, boundary + seeded random inputs, mismatches explained by hypotheses, keep-or-fix decisions as an allowlist, zero unexplained mismatches, decision table | Postgres (PL/pgSQL legacy) | `./run-24-characterization.sh` | [`logs/24-characterization.log`](logs/24-characterization.log) |
| 25 | [`25-bilingual/`](25-bilingual/) | a translated page that is still English underneath | ICU MessageFormat (plural, select), CLDR plural categories, gender-free wording, `Intl` number/currency/date, `Accept-Language` negotiation with q-values and fallback, catalogue key and argument check, pseudo-localisation, `lang` and language of parts | none (node:http) | `./run-25-bilingual.sh` | [`logs/25-bilingual.log`](logs/25-bilingual.log) |
| 26 | [`26-sso/`](26-sso/) | one password per app, a login that trusts whatever comes back | OpenID Connect, authorization code + PKCE, state, nonce, discovery, ID token validation (signature, iss, aud, exp), one-time login transaction, opaque session cookie stored hashed, SSO, role mapping from a groups claim, 401 vs 403, JIT provisioning on (issuer, sub), RP-initiated logout | Postgres, IdP (oidc-provider) and app processes | `./run-26-sso.sh` | [`logs/26-sso.log`](logs/26-sso.log) |
| 27 | [`27-import/`](27-import/) | a file load that duplicates on rerun and half-applies | natural key, `COPY` into a text staging table, `HEADER match`, SQL validation rules with `pg_input_is_valid`, rejects table with reasons, dry run, diff new / changed / unchanged / missing, upsert with `IS DISTINCT FROM`, batch per file hash, control totals, reconciliation, whole-file refusal | Postgres | `./run-27-import.sh` | [`logs/27-import.log`](logs/27-import.log) |
| 28 | [`28-campaign/`](28-campaign/) | a mail-out that sends twice to some and never to others | job table per (year, member), idempotent enqueue, claim with `FOR UPDATE SKIP LOCKED`, lease and fenced outcome, crash and resume, the in-doubt window and a stable `Message-ID`, 4xx vs 5xx, exponential backoff with jitter, dead letters, throttling, dry-run sample, deterministic PDF, campaign report | Postgres, SMTP sink (smtp-server), worker processes | `./run-28-campaign.sh` | [`logs/28-campaign.log`](logs/28-campaign.log) |
| 29 | [`29-kpis/`](29-kpis/) | numbers that look good while members fail | usage events and request log from the app, KPI definitions with owner and target, adoption, task success, funnel, percentiles, availability SLO, error budget and burn rate, SLA, static dashboard | Postgres, node:http | `./run-29-kpis.sh` | [`logs/29-kpis.log`](logs/29-kpis.log) |
| 30 | [`30-pipeline/`](30-pipeline/) | unchecked changes, ad hoc releases | pipeline as code, stages and fail fast, rules per trigger, scheduled releases, cache versus artifacts, job isolation, gate that blocks only releases, deploy job (`environment`, `resource_group`, atomic symlink switch), GitHub Actions equivalent | none (gitlab-ci-local, shell executor) | `./run-30-pipeline.sh` | [`logs/30-pipeline.log`](logs/30-pipeline.log) |
| 31 | [`31-runbook/`](31-runbook/) | operations in one person's head | runbook sections (preconditions, steps, verification, rollback), executable Markdown, manual steps and do-nothing scripting, automatic rollback through the same runbook, run log, up/down migrations, ADRs, onboarding checklist, docs-lint | Postgres, node:http | `./run-31-runbook.sh` | [`logs/31-runbook.log`](logs/31-runbook.log) |
| 32 | [`32-casebook/`](32-casebook/) | a design that does not hold together | time-boxed design case, discovery plan, stakeholder map, personas and journeys, Given/When/Then criteria, traceability check, diagrams as code (C4, sequence, ER, state, gantt), ER = DDL and states = CHECK, journey queries on the DDL, strangler plan, risk register, KPIs | Postgres, Chromium (mermaid-cli) | `./run-32-casebook.sh` | [`logs/32-casebook.log`](logs/32-casebook.log) |

Each script starts from a fresh state (`docker compose down -v && up` where there is infra), installs deps, runs the demo, then dumps the raw tables as proof. Everything it prints goes to `logs/<name>.log`. Needs Docker and Node 22.

Ports (chosen to avoid clashing with other local services):

| # | Postgres | Kafka | Kafka Connect | HTTP |
| --- | --- | --- | --- | --- |
| 01 | 55434 | | | |
| 02 | 55438 | | | |
| 03 | 55433 | | | |
| 05 | | | | 53000 proxy, 53001 legacy, 53002 new |
| 06 | 55445 | | | 53010 payments, 53011 catalog |
| 07 | 55450 | | | 53020 files API |
| 08 | 55439 | | | |
| 09 | 55437 | 59094 | | |
| 10 | 55435 | 59092 | 58083 | |
| 11 | 55436 | 59093 | 58084 | |
| 12 | 55446 | 59095 | | |
| 13 | 55440 | | | |
| 14 | 55441 shard 0 primary, 55442 shard 1 primary, replicas on random ports | | | |
| 15 | 55447 | | | |
| 16 | 55443 | | | |
| 17 | 55444 | | | |
| 18 | 55448 | | | |
| 19 | 55449 | | | |
| 20 | 55451 | | | 53030 portal (next start) |
| 21 | | | | 53031 forms |
| 22 | 55452 | | | 53032 portal (hand run; test workers use free ports) |
| 23 | 55453 | | | |
| 24 | 55454 | | | |
| 25 | | | | 53035 member page |
| 26 | 55456 | | | 53036 IdP, 53037 app |
| 27 | 55457 | | | |
| 28 | 55458 | | | 52528 SMTP sink |
| 29 | 55459 | | | 53039 portal |
| 30 | | | | 53040 app (npm start, hand run) |
| 31 | 55461 | | | 53041 member service |
| 32 | 55462 | | | |

---

## 01. CRUD with audit log (`01-crud-audit/`)

**Pain: lost history.** An `UPDATE` or `DELETE` overwrites the old value, so nobody can later say who changed what, when, or what it was before.

**Reach for it when** support or compliance asks who changed what, and reads of current state dominate: most business apps, with one service and one database.

**Do not reach for it when** the history is the domain and you need to rebuild state or add read models later (03). Writes that bypass the app must be audited too: use triggers (with `SET LOCAL app.actor` for the user) or `pgaudit`. Several services need one central trail (17).

### Concepts

- **CRUD**: the table holds only the *current* state. `UPDATE` overwrites, `DELETE` erases. On its own, the database cannot tell you what a row looked like yesterday or who changed it.
- **Audit log**: a second, append-only table. Every write adds one row: `entity`, `entity_id`, `action` (create/update/delete), `actor`, `before` and `after` snapshots as JSONB, and `at`. Append-only is a convention here; in production enforce it (`REVOKE UPDATE, DELETE ON audit_log`, or a trigger that rejects them).
- **Ordering**: `at` is `now()`, the transaction start time, so it can be out of order under contention; `history()` orders by `id`, which the row lock keeps in order per entity.
- **Same transaction**: the data change and its audit row are committed together (`tx()` in `src/db.ts`). Either both exist or neither does. That is what makes the log trustworthy. If you write the audit afterwards, a crash between the two leaves a silent gap.
- **Capturing `before`**: an update first runs `SELECT ... FOR UPDATE`. That locks the row, so no concurrent writer can change it between reading `before` and writing `after`.
- **Trade-off**: the audit is only as complete as the code paths that call it. A manual `psql` UPDATE or another service writing the same table bypasses it. The alternatives are DB triggers (catch every writer, but only know the DB role unless the app passes the user in, e.g. `SET LOCAL app.actor = 'bob'` read with `current_setting('app.actor')`) and CDC (10, reads the WAL). The audit also stores snapshots, not intent: it says the price went 49 -> 39, not *why*.

### Proof (`logs/01-crud-audit.log`)

The audit insert fails (an empty actor violates `CHECK (actor <> '')`), so the price change rolls back with it:

```
## 3. Atomicity
   concept: if the audit insert fails (empty actor violates CHECK), the data change rolls back with it
   rejected: new row for relation "audit_log" violates check constraint "audit_log_actor_check"
   price still: 39.00
```

After the delete, `products` is empty but the history survives. Note id `4` is missing from `audit_log`: the rolled-back insert used up a sequence value and then vanished with its transaction.

```
 id | name | price
----+------+-------
(0 rows)

 id | entity  | entity_id | action | actor |                        before                        |                        after
----+---------+-----------+--------+-------+------------------------------------------------------+------------------------------------------------------
  1 | product | 1         | create | alice |                                                      | {"id": 1, "name": "Keyboard", "price": "49.00"}
  2 | product | 1         | update | bob   | {"id": 1, "name": "Keyboard", "price": "49.00"}      | {"id": 1, "name": "Keyboard", "price": "39.00"}
  3 | product | 1         | update | alice | {"id": 1, "name": "Keyboard", "price": "39.00"}      | {"id": 1, "name": "Mech Keyboard", "price": "39.00"}
  5 | product | 1         | delete | carol | {"id": 1, "name": "Mech Keyboard", "price": "39.00"} |
```


### Origins and further reading

- Article: "Audit Log", Martin Fowler, 2004. https://martinfowler.com/eaaDev/AuditLog.html
- Article: "Temporal Patterns", Martin Fowler, mid-2000s. https://martinfowler.com/eaaDev/timeNarrative.html
- Book: *Developing Time-Oriented Database Applications in SQL*, Richard T. Snodgrass, 1999 (free PDF from the author). https://www2.cs.arizona.edu/~rts/tdbbook.pdf

---

## 02. Expand / contract schema change (`02-expand-contract/`)

**Pain: deploy breakage.** During a rolling deploy or a rollback, old and new app versions run against the same schema, so a plain `RENAME` or type change breaks whichever version expects the other shape.

**Reach for it when** you change a schema (rename, split, type change) on a system where old and new app versions, or other readers of the table, run at the same time.

**Do not reach for it when** you can take downtime, or the app and schema deploy as one unit with no other readers (pre-launch, internal tool): the multi-release dance is pure cost. The change is purely additive (a new nullable column): it is already backward compatible and needs no contract phase. Nobody will schedule the contract step: a half-done migration leaves two columns and the write-both code in place forever.

Renames `users.name` to `display_name` with zero downtime. In every phase, the app versions that overlap during a rolling deploy must all keep working.

### Concepts

- **Rolling deploy**: new instances start while old ones still serve traffic, so two app versions always share one schema for a while. A schema change is safe only if it works for both the version before and the version after.
- **Why a plain `RENAME` fails**: it is atomic for the database but instant breakage for every instance still running the old code. The same holds for dropping a column, adding a `NOT NULL` column without a default, or changing a type.
- **Expand**: only additive, backward-compatible changes. Add `display_name` as nullable, and relax `NOT NULL` on `name` so a future version can stop writing it.
- **Dual write**: v2 writes both columns and still reads the old one. It runs next to v1, which knows nothing about `display_name`. Unlike the dual-write problem in 09, both columns go in one statement, so they cannot diverge.
- **Backfill**: once v1 is fully retired, copy `name` into `display_name` for old rows (`UPDATE ... WHERE display_name IS NULL`; batch it on big tables). Doing it earlier would leave gaps, because v1 keeps writing rows without the new column.
- **Switch reads**: v3 reads `display_name`. It is only safe after the backfill; the demo probes a premature switch and finds blank names.
- **Tighten**: when every writer fills `display_name`, make it `NOT NULL`. Then v4 stops writing `name`. On a big table, `SET NOT NULL` scans under an exclusive lock: first add `CHECK (display_name IS NOT NULL) NOT VALID`, then `VALIDATE CONSTRAINT` (no blocking lock); from Postgres 12, `SET NOT NULL` reuses that check and skips the scan. Run migrations with a short `lock_timeout`.
- **Contract**: when no running version touches `name`, drop it. Each phase is a separate deploy that can be paused or rolled back one step; once v4 stops writing `name`, rolling back past v3 would show blanks, and the contract step is fully one-way.
- **Trade-offs**: one logical change becomes three app deploys (v2, v3, v4) and four migrations spread over days. Tools like `pgroll` and `reshape` automate the pattern with views and triggers so both schema versions are served at once.

### Proof (`logs/02-expand-contract.log`)

The naive rename breaks the running v1 instantly:

```
   migration naive: ALTER TABLE users RENAME COLUMN name TO display_name
   v1 (write name, read name): FAILS: column "name" of relation "users" does not exist
```

Every phase keeps both overlapping versions working, and reading the new column before the backfill would show blanks (abridged):

```
## 1. Expand
   v1 (write name, read name): write ok, read 2 rows, all have a name
   v2 (write both, read name): write ok, read 3 rows, all have a name
   probe v3 (write both, read display_name): 2 rows WITHOUT a name
## 3. Switch reads
   v2 (write both, read name): write ok, read 5 rows, all have a name
   v3 (write both, read display_name): write ok, read 6 rows, all have a name
## 4. Stop writing the old column
   v3 (write both, read display_name): write ok, read 7 rows, all have a name
   v4 (write display_name, read display_name): write ok, read 8 rows, all have a name
```

Contracting too early would have broken v3, which is why each phase waits for the previous version to be fully gone:

```
## Why the order matters
   v3 (write both, read display_name): FAILS: column "name" of relation "users" does not exist
```


### Origins and further reading

- Article: "Parallel Change", Danilo Sato, 2014 (the name for expand/contract). https://martinfowler.com/bliki/ParallelChange.html
- Book: *Refactoring Databases: Evolutionary Database Design*, Scott Ambler and Pramod Sadalage, 2006. https://www.martinfowler.com/books/refactoringDatabases.html
- Article: "Evolutionary Database Design", Pramod Sadalage and Martin Fowler, revised 2016. https://www.martinfowler.com/articles/evodb.html
- Article: "Online migrations at scale", Jacqueline Xu (Stripe), 2017 (a data migration in four dual-write steps, a close cousin of expand/contract). https://stripe.com/blog/online-migrations

---

## 03. Event sourcing (`03-event-sourcing/`)

**Pain: lost business history.** A current-state table keeps only the latest values, so what happened (`MoneyWithdrawn`, `OrderCancelled`) and in what order is gone. An audit log beside it (01) records snapshots, not intent, and is not the source of truth, so nothing guarantees it replays into the current state.

**Reach for it when** the history is the domain (ledgers, bookings, workflows) and you need to rebuild state, answer "what was it at time T", or build new read models from events already stored.

**Do not reach for it when** the domain is plain CRUD and you only need to know who changed what: 01 is far cheaper. You would apply it to a whole system by default: every event schema is a contract you version forever, and every current-state query needs a projection that lags the write. You want it as the way services talk to each other: publish separate integration events through an outbox (09) instead of exposing the event store.

### Concepts

- **Events are the source of truth**: there is no `accounts` table. The `events` table stores facts in the past tense (`AccountOpened`, `MoneyDeposited`, `MoneyWithdrawn`). Rows are only ever inserted, never updated or deleted (by convention here; enforce it with `REVOKE UPDATE, DELETE` or a trigger).
- **Mistakes are fixed with new events**: a wrong deposit is corrected by a compensating event (a reversal), never by editing history.
- **Stream**: all events of one aggregate (one account), keyed by `stream_id`, ordered by `version` 1, 2, 3...
- **Rehydrate / fold**: current state = a `reduce` over the events that applies `evolve` and counts versions (`rehydrate` in `src/account.ts`). `evolve` is a pure function `(state, event) -> state`.
- **Command -> decide -> append**: a command (`withdraw 30`) loads the stream, rebuilds state, checks invariants (enough balance?), and returns *new events*. Only those events are persisted. A rejected command writes nothing.
- **Optimistic concurrency**: the writer says "I decided based on version N", so its events get versions N+1, N+2... `UNIQUE (stream_id, version)` makes a second writer that also read N fail with `ConcurrencyError`. That writer reloads, decides again against the fresh state, and appends (`handleWithRetry`, bounded, retries only `ConcurrencyError`). Re-deciding matters: of two concurrent withdrawals of 60 from 71, the loser's retry sees 11 and is rejected instead of overdrawing. No locks are held while deciding.
- **Time travel**: state at any past point = fold only the events before it. Business asks by date ("end of March"), so `readStream(id, before)` filters on `at` (recorded time, with an explicit timezone for the boundary). If the question is about effective time (backdated entries), the event needs its own effective date and the filter runs on that (bitemporal). Filtering by version is the same fold over a prefix.
- **Projections / read models**: new views (a balance table, a "total deposited" report, a search index) are built by replaying the events. They can be thrown away and rebuilt at any time, including views nobody thought of when the events were written. The demo's projection is an in-memory sum; a real read model lives in its own table with a checkpoint (last position applied) and lags slightly behind the writes. Separate write and read models is **CQRS**.
- **Trade-offs**: queries across aggregates need projections, events are forever (so schema evolution/upcasting matters, and personal data in them can only be erased by crypto-shredding, 18), and long streams need snapshots to stay fast. `global_position` orders events across streams, but a BIGSERIAL can have gaps and can commit out of order under concurrent writers, so a projection that tails it needs a guard (a single writer, or reading only up to the oldest in-flight transaction).

### Proof (`logs/03-event-sourcing.log`)

The invariant is checked against rebuilt state, and two writers race:

```
## 2. Invariants are checked against rebuilt state
   rejected: insufficient funds: balance 70, asked 500

## 3. Optimistic concurrency
   writer A and writer B both read v3
   writer A appended v4
   writer B: ConcurrencyError=true (stream account-... moved past v3)

## 3b. Retry
   v4 balance=71 -> appended {"type":"MoneyWithdrawn","amount":60}
   writer B: conflict on attempt 1 (stream account-... moved past v4), reloading and deciding again
   writer B rejected: insufficient funds: balance 11, asked 60
```

State at any point in time, plus a projection derived after the fact:

```
   current state: { owner: 'alice', balance: 11, version: 5 }
   as of 2026-09-27T16:28:50.483Z: { owner: 'alice', balance: 70, version: 3 }
   by version is the same fold over a prefix, e.g. as of v1: { owner: 'alice', balance: 0, version: 1 }
   total deposited = 101
```

The raw table has exactly 5 facts: nothing from the rejected withdrawals and nothing from any losing writer. The gap at `global_position` 5 is losing writer B of step 3: its failed insert still consumed a sequence value, which is the BIGSERIAL gap mentioned above. The constraint doing the work is shown below it (stream_id column omitted).

```
 global_position | version |      type      |        data
               1 |       1 | AccountOpened  | {"owner": "alice"}
               2 |       2 | MoneyDeposited | {"amount": 100}
               3 |       3 | MoneyWithdrawn | {"amount": 30}
               4 |       4 | MoneyDeposited | {"amount": 1}
               6 |       5 | MoneyWithdrawn | {"amount": 60}

 events_stream_id_version_key | UNIQUE (stream_id, version)
```


### Origins and further reading

- Article: "Event Sourcing", Martin Fowler, 2005. https://martinfowler.com/eaaDev/EventSourcing.html
- Talk: "CQRS and Event Sourcing", Greg Young, Code on the Beach 2014. https://www.youtube.com/watch?v=JHGkaShoyNs
- Talk: "Event Sourcing", Greg Young, GOTO Aarhus 2014. https://www.youtube.com/watch?v=8JKjvY4etTY
- Talk: "A Decade of DDD, CQRS, Event Sourcing", Greg Young, DDD Europe 2016. https://www.youtube.com/watch?v=LDW0QWie21s

---

## 04. Parallel run, Scientist-style (`04-parallel-run/`)

**Pain: blind rewrite.** Tests cannot show that a rewrite matches legacy on every real input, so you find the differences after cutover, through users.

**Reach for it when** you replace logic whose exact behavior nobody fully knows (pricing, tax, permissions, a query against a new data store) and its outputs can be compared on real production inputs before the new code serves anyone.

**Do not reach for it when** the code has side effects that must not happen twice (charging, emailing) and the candidate cannot be stubbed: run it against a shadow copy, or route a slice of real traffic to it instead (05). Outputs are nondeterministic (timestamps, random ids) and you will not normalize them. The rewrite changes behavior on purpose: every mismatch is noise.

Proves a rewrite matches the legacy code on real traffic before it serves anyone.

### Concepts

- **Control and candidate**: every request runs the legacy function (control) and the rewrite (candidate). The caller always gets the control result, so users are never exposed to the rewrite while it is being checked.
- **Experiment** (`src/scientist.ts`): runs both, compares results with deep equality, and records every mismatch with its input. It swallows candidate exceptions (the rewrite crashing must not hurt users) and randomizes which side runs first, so neither side is systematically favoured by order (caches, warm-up, shared state).
- **Real inputs beat unit tests**: legacy code encodes years of undocumented behavior. Production traffic finds the edge cases nobody wrote a test for; here, the free-shipping boundary (`>=` vs `>`), per-item vs per-order weight rounding, and empty carts.
- **Iterate to zero**: fix the candidate and keep running until mismatches stay at zero over a meaningful volume. Here v2 is re-checked on the same orders that exposed v1's bugs; in production keep it running on new traffic, since zero on inputs you already fixed for proves little.
- **In real Scientist**: experiments run on a sampled percentage of requests (`enabled?`), record control vs candidate durations, and let you `ignore` known, accepted mismatches so new ones stand out.
- **Cutover**: swap roles. The rewrite becomes control (it serves) and legacy becomes the candidate (it is still checked). Once that is quiet, delete legacy.
- **Limits**: only safe for side-effect-free reads; running a write twice doubles it (for writes, compare against a shadow copy or use 05's routing instead). It costs double compute while it runs. For HTTP-level comparison, the same idea is called traffic shadowing or dark launching.

### Proof (`logs/04-parallel-run.log`)

The buggy rewrite disagrees on 567 of 1000 orders, yet every user got the legacy answer:

```
   experiment "shipping-v1": 1000 runs, 567 mismatches (188 candidate exceptions)
   users unaffected: served total 1980900 === legacy total 1980900: true
```

The mismatches group into three distinct bugs; each mismatch keeps its input, so any one reproduces (one shown, abbreviated):

```
   188 candidate exceptions, swallowed by the experiment: "order has no items" (legacy quotes empty carts at the 1 kg minimum)
   17 at exactly the free-shipping threshold: legacy uses >= 5000, rewrite uses > 5000
   362 from weight rounding: legacy rounds the order total up to kg, rewrite rounds each item
   example: {"zone":"eu","items":[{"sku":"sku-0","grams":1293,...},{"sku":"sku-1","grams":344,...}]} -> control 1800, candidate 2700
```

After the fix, the rewrite matches, takes over, and legacy becomes the check:

```
   experiment "shipping-v2": 1000 runs, 0 mismatches (0 candidate exceptions)
   experiment "shipping-cutover": 1000 runs, 0 mismatches (0 candidate exceptions)
   served total 1980900 === legacy total 1980900: true
```


### Origins and further reading

- Book: *Monolith to Microservices*, Sam Newman, 2019 (Parallel Run pattern). https://samnewman.io/books/monolith-to-microservices/
- Article: Scientist 1.0 launch post, Jesse Toth, GitHub blog, 2016. https://github.blog/developer-skills/application-development/scientist/
- Talk: "Easy Rewrites with Ruby and Science!", Jesse Toth, RubyConf 2014. https://www.youtube.com/watch?v=kgDqUHWVw4A
- Article: "Move Fast and Fix Things", Vicent Marti, GitHub blog, 2015 (Scientist used on git merge code). https://github.blog/engineering/engineering-principles/move-fast/

---

## 05. Strangler fig behind a proxy (`05-strangler-fig/`)

**Pain: big-bang cutover.** Replacing a whole system in one switch is all-or-nothing: months without shipping, then one risky day with no easy way back.

**Reach for it when** replacing a large live system incrementally, when traffic can be routed by capability (URL, message type) and each piece can move on its own.

**Do not reach for it when** the system is small enough to replace in one release. The capability sits deep inside the monolith with no seam to route on: use branch by abstraction there. You would move the code but leave the shared database in place: plan the data move too (10, 11), or the coupling stays. There is no commitment to finish: a half-strangled system runs two stacks forever.

Replaces a monolith one capability at a time, behind a routing facade that clients never see change. Named by Martin Fowler (bliki "StranglerFigApplication", 2004).

### Concepts

- **Facade (the proxy)**: clients switch once to a proxy in front of the legacy system. From then on, every migration step is a routing change inside the proxy, invisible to clients. In production this is an API gateway, a load balancer rule, nginx or Envoy, and a cutover usually shifts a percentage of traffic or a user cohort (canary) before moving 100%.
- **Strangling**: build one capability (`/orders`) in the new service, then route only that path to it. The new system grows around the old one until nothing is left, like the fig vine the pattern is named after.
- **Same contract**: the new service must answer exactly like legacy, or clients break. The new service has its own internal model (`totalCents`, `state: "PAID"`) and translates it to the legacy shape at its edge. The demo records legacy's responses (status and body) as a baseline and checks every proxied response against it, so a translation bug would show up as `false`. 04's parallel run is how you gain that confidence before flipping a route.
- **Instant rollback**: pointing a route back is one config call (`PUT /_proxy/routes`), no deploy and no client change. That is what makes each step low-risk.
- **Decommission signal**: once legacy receives zero traffic (and nothing bypasses the proxy: batch jobs, direct DB readers, internal callers), it can be switched off.
- **What the demo simplifies**: both services hold hard-coded copies of the same data. In a real migration, data ownership is the hard part. The new service needs the data legacy owns, usually via CDC (10) or events (09, 11) during the transition, and writes must have one owner per capability at any time.

### Proof (`logs/05-strangler-fig.log`)

Legacy traffic shrinks as routes move, with a rollback in the middle, and every response keeps legacy's contract (abridged):

```
## 1. Strangle the first capability
   routes: /orders -> new
   GET /users/1    -> legacy-monolith same contract as legacy: true
   GET /orders/1   -> new-service     same contract as legacy: true
   GET /invoices/1 -> legacy-monolith same contract as legacy: true
   legacy handled 2/3 client requests

## 2. Roll back in one call
   routes: (none, everything falls through to legacy)
   legacy handled 3/3 client requests

## 3. Move more capabilities
   routes: /orders -> new, /invoices -> new
   legacy handled 1/3 client requests

## 4. Last route moved, legacy receives nothing
   routes: /orders -> new, /invoices -> new, /users -> new
   GET /users/1    -> new-service     same contract as legacy: true
   GET /orders/1   -> new-service     same contract as legacy: true
   GET /invoices/1 -> new-service     same contract as legacy: true
   legacy handled 0/3 client requests
```


### Origins and further reading

- Article: "Strangler Fig Application", Martin Fowler, 2004, revised later. https://www.martinfowler.com/bliki/StranglerFigApplication.html
- Book: *Monolith to Microservices*, Sam Newman, 2019. https://samnewman.io/books/monolith-to-microservices/
- Talk: "Monolith Decomposition Patterns", Sam Newman, GOTO Berlin 2019. https://www.youtube.com/watch?v=9I9GdSQ1bbM
- Talk: "Dissecting our Legacy: The Strangler Fig Pattern with Apache Kafka, Debezium and MongoDB", Gunnar Morling and co-speaker, 2021. https://www.youtube.com/watch?v=R1kOuvLYcYo

---

## 06. Reliability between services (`06-service-reliability/`)

**Pain: one flaky dependency takes the caller down.** A call with no deadline waits as long as a hung dependency does, and every waiting call holds a socket the healthy dependencies need. Naive retries turn a blip into an outage, and retrying a POST that timed out after the server committed charges the customer twice.

**Reach for it when** a service calls another over the network on a request path: every such call needs a timeout, a retry policy that knows which failures are transient, and, for writes, an idempotency key. Add a breaker and a bulkhead when one dependency's outage must not slow down or starve everything else.

**Do not reach for it when** the work does not need an answer now: put it on a queue or an outbox (09) and let a consumer retry at its own pace. The operation spans services that each commit their own data: retries make each step safe, a saga (08) handles the whole. A service mesh or client library already gives you timeouts, retries and breakers: configure it rather than hand-rolling a second layer, and make sure only one layer retries.

A caller process against `payments`, a separate HTTP process with its own Postgres database that the demo degrades, overloads, kills and restarts. Every mechanism is written by hand in `src/resilience.ts`.

### Concepts

- **Timeout on every call**: without one, the caller waits as long as the dependency does (1.5s here, forever if it hangs), holding a socket and the user's request the whole time. `call()` passes `AbortSignal.timeout()` to `http.request`, so the deadline also covers time spent queued for a socket.
- **Deadline propagation**: a timeout frees the caller but not the dependency, which keeps working for nobody (10 queries ran their full 1500ms, 10 answers written to a closed connection). The caller sends its remaining budget in `x-deadline-ms`, a relative duration like gRPC's `grpc-timeout`, so no clock sync is needed. Payments applies it as `SET LOCAL statement_timeout`, and Postgres cancels the query at the deadline: 2045ms of database time instead of 15050ms. A service that calls further down passes on what is left of its own budget.
- **Bulkhead**: sockets (or threads, or pool connections) shared across dependencies are the path a failure spreads along. With one pool of 10 sockets, 10 slow payment calls make the healthy catalog wait 1457ms. `Bulkhead` caps payments at 4 calls in flight and rejects the rest at once, and catalog has its own pool, so it answers in 2ms. Rejecting beyond the limit is the point: a queue would just move the wait.
- **Retry only what can succeed next time**: `isRetryable` accepts timeouts, connection errors (reset, refused), 429, 502, 503, 504, and 409 when the same idempotency key is still in flight. A 400 or 422 fails the same way forever and is not retried. `withRetries` also stops at max attempts, and before a backoff that would overshoot the caller's overall deadline. Each attempt's timeout is the smaller of the per-attempt limit and what is left of that deadline. A `Retry-After` header is a floor on the next delay.
- **Backoff with full jitter**: without jitter, callers that failed together retry together (100, 200, 400, 800ms), so every wave hits the dependency's capacity at the same instant and most of it is shed again: 25 of 100 callers succeeded. Full jitter (`random(0, min(cap, base * 2^attempt))`, Marc Brooker) spreads the same retries over the gaps: 100 of 100 succeeded, with fewer requests. Immediate retries are the worst case: 465 requests in 32ms and only 10 successes.
- **Retry budget**: max attempts still multiplies load by up to 5 during a real outage (500 requests for 100 callers, none of which could succeed). A budget caps retries as a share of traffic across the whole caller: each request earns 0.1 token, a retry costs 1, at most 10 are banked (Finagle's `RetryBudget`, gRPC's retry throttling). The same outage then costs 110 requests. It only protects if every caller runs one, and only one layer of the stack should retry.
- **Idempotency key**: a timeout says nothing about whether the server committed. Payments commits alice's charge, answers late, the caller retries, and alice pays twice. The caller creates one `Idempotency-Key` per logical operation and reuses it on every retry. Payments claims the key (`INSERT ... ON CONFLICT (key) DO NOTHING`, the key is the primary key), then inserts the charge and stores the response in one transaction. A retry gets the stored response back (`idempotent-replayed: true`) and no new charge. A concurrent duplicate that arrives while the first is in flight gets `409` with `Retry-After: 1`, retries, and gets the replay. The same key with a different body (by request hash) gets `422`, which is not retried. Status codes follow the IETF Idempotency-Key draft and Stripe.
- **What the idempotency sketch leaves out**: if payments crashes between claiming the key and committing, the key stays in flight forever. Brandur Leach's design adds a `locked_at` lease that a later request may take over. Keys should be scoped to the authenticated account, not global, and expired after a retention window (Stripe keeps them 24 hours).
- **Circuit breaker**: while the dependency is degraded, every call still pays the full 200ms timeout, and the dependency still receives all 40 requests. After 5 consecutive failures `CircuitBreaker` opens, and calls fail in 0ms without reaching payments (9 of 40 did). After a 1000ms cooldown it goes half-open and lets exactly one probe through: a failed probe reopens it, a successful one closes it. The run shows the probe failing on a timeout, then on `ECONNREFUSED` while the process is dead, and then succeeding after the restart. Only dependency failures (timeouts, connection errors, 5xx) count. A 4xx is the caller's fault and does not trip it. The cost shows too: after the restart, requests keep failing fast until the next probe (14 of 30 in the healed window). Nygard's *Release It!* named the pattern; Hystrix, resilience4j and Polly are the usual libraries.
- **What the demo simplifies**: the caller and its "users" are one process, and faults are switched by an admin endpoint instead of arising by themselves. A production breaker usually trips on a failure rate over a sliding window rather than a consecutive count, and bulkheads, breakers and budgets are kept per dependency (often per endpoint) and exported as metrics.

### Proof (`logs/06-service-reliability.log`)

A timeout frees the caller. Only the propagated deadline also stops the dependency's work:

```
   no timeout                     caller: waited 1526-1529ms, 10 ok
                                  payments: 10 queries ran to completion, 0 cancelled at the deadline, 15204ms of DB time in total, 0 answers written to a closed connection
   200ms timeout                  caller: waited 201-203ms, 10 timeout (no reply within 200ms)
                                  payments: 10 queries ran to completion, 0 cancelled at the deadline, 15050ms of DB time in total, 10 answers written to a closed connection
   200ms timeout + x-deadline-ms  caller: waited 201-202ms, 10 timeout (no reply within 200ms)
                                  payments: 0 queries ran to completion, 10 cancelled at the deadline, 2045ms of DB time in total, 10 answers written to a closed connection
```

A shared pool lets slow payments starve healthy catalog. The bulkhead rejects instead:

```
   one shared pool (10 sockets)  payments: 10 ok; catalog waited 1457-1458ms (queued behind payments)
   bulkhead (payments limit 4)   payments: 4 ok, 6 bulkhead-full (4 calls already in flight), rejections took 0ms; catalog waited 2ms
```

Transient failures are retried, a 400 is not (abridged):

```
   payments will answer: connection reset, then ok
      attempt 1: network (socket hang up) -> retry in 18ms
      => ok after 21ms; payments received 2 request(s)
   payments will answer: 400 bad request
      attempt 1: HTTP 400 invalid amount -> not retryable, give up
      => failed: HTTP 400 invalid amount after 0ms; payments received 1 request(s)
```

100 callers at once against 5 requests per 25ms. Lockstep retries arrive as spikes and most are shed again. Full jitter spreads them and everyone gets through. During a full outage, the budget cuts the load from 500 requests to 110:

```
   immediate retries
      arrivals per 100ms: 465
      465 requests reached payments for 100 callers; 10 succeeded, 90 gave up; slowest caller done after 32ms
   exponential backoff, no jitter (100, 200, 400, 800ms: every caller retries at the same instants)
      arrivals per 100ms: 100  95   0  90   0   0   0  85   0   0   0   0   0   0   0  80
      450 requests reached payments for 100 callers; 25 succeeded, 75 gave up; slowest caller done after 1523ms
   exponential backoff, full jitter (random between 0 and 100, 200, 400, 800ms)
      arrivals per 100ms: 211  42  41  15  10   7   3   3   0   2   1   1
      336 requests reached payments for 100 callers; 100 succeeded, 0 gave up; slowest caller done after 1136ms
   payments is fully down (503 for everything): retries cannot help, they only multiply the load
   full jitter, no budget
      arrivals per 100ms: 220  73  48  27  30  30  17   7  10  17  10   8   3
      500 requests reached payments for 100 callers; 0 succeeded, 100 gave up; slowest caller done after 1288ms
   full jitter + retry budget (each request earns 0.1 retry token, a retry costs 1, at most 10 banked)
      arrivals per 100ms: 109   1
      110 requests reached payments for 100 callers; 0 succeeded, 100 gave up; slowest caller done after 99ms
```

The same fault, a commit followed by a late answer, with and without a key. Then a concurrent duplicate and a reused key:

```
   alice, no key. payments commits the charge, then answers after 1000ms
      attempt 1: timeout (no reply within 300ms) -> retry in 67ms
      => 201 {"id":2,"customer":"alice","amount":"42.00"}
   bob, key charge-bob-1. same fault
      attempt 1: timeout (no reply within 300ms) -> retry in 85ms
      => 201 {"id":3,"amount":"42.00","customer":"bob"} (idempotent-replayed: stored response, no new charge)
   carol, key charge-carol-1 sent twice at once (a double click). payments holds the first transaction open for 1000ms
      attempt 1: HTTP 409 a request with this key is in flight -> retry in 1000ms
      => 201 {"id":4,"customer":"carol","amount":"42.00"}
      => 201 {"id":4,"amount":"42.00","customer":"carol"} (idempotent-replayed: stored response, no new charge)
   bob again, same key charge-bob-1 but amount 99.00
      attempt 1: HTTP 422 idempotency key reused with a different request -> not retryable, give up
```

```
 customer | charges | total
 alice    |       2 | 84.00
 bob      |       1 | 42.00
 carol    |       1 | 42.00

      key       | response_status |                   response_body
 charge-bob-1   |             201 | {"id": 3, "amount": "42.00", "customer": "bob"}
 charge-carol-1 |             201 | {"id": 4, "amount": "42.00", "customer": "carol"}
```

Without a breaker, all 40 calls reach the degraded payments. With one, 9 do. It probes through the crash and closes after the restart:

```
   without a breaker, 2s: 40 timeout (no reply within 200ms); each took 200-202ms; payments received 40 requests
      t+ 408ms breaker closed -> open (5 consecutive failures)
      t+1427ms breaker open -> half-open (1000ms cooldown over, let one probe through)
      t+1629ms breaker half-open -> open (probe failed: timeout (no reply within 200ms))
   with a breaker, 2s degraded: 9 timeout (no reply within 200ms), 31 breaker-open; payments received 9 requests; fast failures took 0ms
   [payments pid 55069] killed
      t+2647ms breaker open -> half-open (1000ms cooldown over, let one probe through)
      t+2648ms breaker half-open -> open (probe failed: network (ECONNREFUSED))
   ...
   [payments pid 55334] listening on :53010, catalog on :53011
   t+3976ms payments restarted, healthy
      t+4685ms breaker open -> half-open (1000ms cooldown over, let one probe through)
      t+4687ms breaker half-open -> closed (probe succeeded)
   with a breaker, 1.5s healed: 14 breaker-open, 16 ok
```

### Origins and further reading

- Article: "Exponential Backoff And Jitter", Marc Brooker, AWS Architecture Blog, 2015 (full jitter). https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- Article: "Timeouts, retries, and backoff with jitter", Marc Brooker, Amazon Builders' Library. https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
- Article: "Making retries safe with idempotent APIs", Malcolm Featonby, Amazon Builders' Library. https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/
- Article: "Implementing Stripe-like Idempotency Keys in Postgres", Brandur Leach, 2017 (409 for in-flight keys, lock leases, recovery). https://brandur.org/idempotency-keys
- Spec: "The Idempotency-Key HTTP Header Field", IETF httpapi draft (409 for a concurrent request, 422 for a reused key with a different payload). https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
- Book: *Release It!* (2nd ed.), Michael Nygard, 2018 (circuit breaker, bulkhead, timeouts as stability patterns). https://pragprog.com/titles/mnee2/release-it-second-edition/
- Article: "Circuit Breaker", Martin Fowler, 2014. https://martinfowler.com/bliki/CircuitBreaker.html
- Docs: "Deadlines", gRPC (deadline propagation to downstream calls). https://grpc.io/docs/guides/deadlines/
- Docs: Finagle clients, retries and `RetryBudget`. https://twitter.github.io/finagle/guide/Clients.html#retries

---

## 07. File upload API with ETags (`07-file-upload/`)

**Pain: a file API that loses writes, duplicates creates and serves torn downloads.** A client retries a create that timed out and gets two files. Two clients read version 1 and both write, and the second silently erases the first. A download resumed after the file changed splices the start of the old bytes onto the end of the new ones. A client syncing "what changed since" on `updated_at` never sees a change whose transaction committed late.

**Reach for it when** clients create, overwrite and download files (or any resource) over HTTP, retry on timeouts, cache what they read, resume large downloads, or keep a local copy in sync with a change feed.

**Do not reach for it when** the files are large or numerous: keep the bytes in object storage (S3, GCS), make `upload_file_url` a presigned URL the client uploads to directly, and keep only the metadata, version and state machine here; multipart or tus uploads handle resuming uploads. Only one writer ever touches a file: `If-Match` still costs nothing, but the lost update cannot happen. A client needs every change as an event, in order and pushed: publish them through an outbox (09) instead of polling a feed.

An Express 5 API with metadata and content in Postgres, and a client that starts it as a separate process and runs 7 scenarios against it: `POST /v1/files` (metadata, `Idempotency-Key`), `PUT /v1/files/{fileId}/content` (`If-Match`), `GET /v1/files/{fileId}`, `GET /v1/files/{fileId}/content` (`If-None-Match`, `Range`, `If-Range`) and `GET /v1/files?changed_since=&limit=&cursor=`. Every call carries `Authorization: Bearer`.

### Concepts

- **Two-step upload**: `POST /v1/files` creates the metadata in `pending` and answers `upload_file_url`; `PUT` on that URL sends the bytes and moves the file to `complete`. Here the URL points back at the API. In production it is a presigned object-storage URL, and the storage's upload notification (or a `HEAD` on the object) completes the file. A declared `size` is checked on the first upload (422 otherwise); a `sha256` is computed and stored.
- **Bearer token scoped to an owner**: every query filters on the owner the token maps to. Another owner's file is 404, not 403, so ids do not reveal which files exist. A missing or unknown token is 401 with `WWW-Authenticate: Bearer`.
- **Idempotency-Key on POST**: the same pattern as 06, scoped per owner (`PRIMARY KEY (owner, key)`). The key row, with the full response, and the file row commit in one transaction, so a key is never claimed without its file. A retry replays the stored `201`, `ETag` and body with `Idempotent-Replayed: true`. A concurrent duplicate blocks on the primary key until the first commits, then replays: no 409 is needed when the claim and the work share a database. The same key with a different body is 422, a missing or non-UUID key is 400.
- **ETag = version**: the ETag is the file's `version` in quotes, bumped by every write. A strong ETag must change whenever the bytes change, so `PUT` answers the *new* one (`"1"` then `"2"`): answering `"1"` again would let a stale client overwrite. Express's own automatic weak ETags are turned off.
- **If-Match, optimistic concurrency**: `PUT` without `If-Match` is 428 Precondition Required (RFC 6585), so no client can write blind. A stale tag is 412 with the current `ETag`, so the client re-reads, merges, and retries. The check is not just the `SELECT`: the `UPDATE` itself says `WHERE version = $read`, so two writers holding the same tag cannot both pass (in the run, writer B lost the race and got 412). `If-Match` uses the strong comparison, so `W/"2"` never matches.
- **If-None-Match, revalidation**: a client that kept the ETag gets 304 with no body while it is still current. This comparison is weak, so `W/"3"` matches `"3"`. `Cache-Control: private, no-cache` lets a client cache but makes it revalidate each time. On the content endpoint `If-None-Match` is evaluated before `Range` (RFC 9110 13.2.2).
- **Range and If-Range**: `Range: bytes=0-9`, `bytes=10-` and `bytes=-6` get 206 with `Content-Range`; a range past the end gets 416 with `Content-Range: bytes */36`; a multi-range or malformed header is ignored and the whole content sent, which RFC 9110 allows. `If-Range` makes resuming safe: the client sends the ETag of the part it already has, and if the file changed since, the server sends the whole new file (200) instead of the rest of a different one. Without it, the run shows the spliced result.
- **Change feed on `changed_xid`, not `updated_at`**: `updated_at = now()` is the time the writing transaction started, but other readers only see the row when it commits. A transaction that starts first and commits last produces a row stamped earlier than rows a client has already paged past, and a cursor on `updated_at` never looks back: the run shows an `updated_at` client losing a rename. The feed stores `changed_xid = pg_current_xact_id()` (64-bit, no wraparound) on every write and serves only rows whose transaction is older than every transaction still running (`changed_xid < pg_snapshot_xmin(pg_current_snapshot())`). Rows behind the cursor are then final, so keyset paging on `(changed_xid, id)` misses nothing: a late commit is held back, then served in order. A row updated again moves forward, so the feed is at-least-once: the client upserts by `fileId`.
- **The cursor is a sync token**: it is opaque (base64url of `changed_xid, id`), the next page is in `Link: <...>; rel="next"` (RFC 8288) so the body stays the plain `[File]` array, and an empty last page still returns the cursor. The client keeps it and polls with it later. `changed_since` only picks the starting point of a first sync.
- **What the sketch leaves out**: the xmin horizon is cluster-wide, so any long transaction (or an idle-in-transaction session) stalls the feed until it ends; set `idle_in_transaction_session_timeout`. Deletes need a tombstone row (`status = 'deleted'`) or the feed never reports them. Content lives in `bytea` and is buffered in memory, capped at 10 MB; stream it to object storage instead. The two tokens are hard-coded; a real service validates a JWT or looks the token up. Idempotency keys should expire after a retention window.

### Proof (`logs/07-file-upload.log`)

A retry and a concurrent duplicate both return the first file:

```
   Idempotency-Key 3595be39...
   POST /v1/files                                                 -> 201 [etag: "1"] {"fileId":"1d414b39","status":"pending","upload_file_url":"http://localhost:53020/v1/files/1d414b39/content"}
   POST /v1/files (retry, same key and body)                      -> 201 [etag: "1", idempotent-replayed: true] {"fileId":"1d414b39","status":"pending","upload_file_url":"http://localhost:53020/v1/files/1d414b39/content"}
   POST /v1/files (same key, different body)                      -> 422 {"status":422,"detail":"this Idempotency-Key was already used with a different body"}
   POST /v1/files (no Idempotency-Key)                            -> 400 {"status":400,"detail":"Idempotency-Key header must be a UUID"}
   POST /v1/files (concurrent duplicate 1 of 2)                   -> 201 [etag: "1"] {"fileId":"8b5848b6","status":"pending","upload_file_url":"http://localhost:53020/v1/files/8b5848b6/content"}
   POST /v1/files (concurrent duplicate 2 of 2)                   -> 201 [etag: "1", idempotent-replayed: true] {"fileId":"8b5848b6","status":"pending","upload_file_url":"http://localhost:53020/v1/files/8b5848b6/content"}
   => 1 fileId for 2 concurrent requests; files rows named report/race/other: 2 (the duplicate waited on the key's primary key, then replayed)
```

`If-Match` rejects the stale writer, the weak tag and the concurrent loser:

```
   PUT content (no If-Match)                                      -> 428 {"status":428,"detail":"If-Match is required: send the ETag you last saw"}
   PUT content If-Match "1", Content-Type: text/plain             -> 415 {"status":415,"detail":"Content-Type must be application/octet-stream"}
   PUT content If-Match "1", 3 bytes (declared 25)                -> 422 {"status":422,"detail":"content is 3 bytes, the file declares 25"}
   PUT content If-Match "1", 25 bytes                             -> 200 [etag: "2"] {"status":"complete"}
   GET /v1/files/1d414b39                                         -> 200 [etag: "2"] {"fileId":"1d414b39","name":"report.txt","content_type":"text/plain","size":25,"sha256":"659c31985f292f5213809064e25e81ed6944b467193d53357eaac01788c46f6d","status":"complete","version":2,"created_at":"2026-09-29T11:05:45.096Z","updated_at":"2026-09-29T11:05:45.212Z"}
   PUT content If-Match "1" (stale: someone already wrote "2")    -> 412 [etag: "2"] {"status":412,"detail":"If-Match \"1\" does not match the current ETag \"2\""}
   PUT content If-Match W/"2" (weak never matches If-Match)       -> 412 [etag: "2"] {"status":412,"detail":"If-Match W/\"2\" does not match the current ETag \"2\""}
   PUT content If-Match "2" (concurrent writer A)                 -> 200 [etag: "3"] {"status":"complete"}
   PUT content If-Match "2" (concurrent writer B)                 -> 412 [etag: "3"] {"status":412,"detail":"If-Match \"2\" lost the race to a concurrent write"}
   => exactly one writer won: version 3, content "writer A's version\n"
```

`If-None-Match` revalidates without a body:

```
   GET /v1/files/1d414b39 If-None-Match "3"                       -> 304 [etag: "3"]
   GET /content If-None-Match "3"                                 -> 304 [etag: "3"]
   GET /content If-None-Match W/"3"                               -> 304 [etag: "3"]
   GET /content If-None-Match "1" (an old version)                -> 200 [etag: "3"] "writer A's version\n"
```

`If-Range` sends the whole new file instead of splicing two versions:

```
   GET /content before any PUT                                    -> 409 {"status":409,"detail":"the file has no content yet: PUT it to upload_file_url first"}
   GET /content Range: bytes=0-9 (connection drops after this)    -> 206 [etag: "2", content-range: bytes 0-9/36] "0123456789"
   GET /content Range: bytes=10- If-Range: "2"                    -> 206 [etag: "2", content-range: bytes 10-35/36] "abcdefghijklmnopqrstuvwxyz"
   GET /content Range: bytes=-6 (last 6 bytes)                    -> 206 [etag: "2", content-range: bytes 30-35/36] "uvwxyz"
   GET /content Range: bytes=100-                                 -> 416 [etag: "2", content-range: bytes */36] {"status":416,"detail":"range bytes=100- is outside the 36 bytes"}
   PUT content If-Match "2" (the file changes)                    -> 200 [etag: "3"] {"status":"complete"}
   GET /content Range: bytes=10- If-Range: "2" (stale)            -> 200 [etag: "3"] "ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210"
   => with If-Range the client gets the new file whole; resuming with Range alone would have spliced "0123456789PONMLKJIHGFEDCBA9876543210"
```

Paging the feed, then a late commit: the `updated_at` client loses the rename, the feed holds `b.txt` back and serves both:

```
   page 1: 200 ["a.txt","b.txt"] Link: rel=next
   page 2: 200 ["c.txt","d.txt"] Link: rel=next
   page 3: 200 ["e.txt"] Link: rel=next
   page 4: 200 [] Link: rel=next
   both clients are caught up: the updated_at client at max(updated_at), the feed client at its last cursor
   slow transaction: renames a.txt (updated_at = its start time), not committed yet
   meanwhile PUT b.txt content -> 200, committed
   poll: updated_at client sees ["b.txt"] and moves its cursor past b.txt
   poll: feed client sees        [] (b.txt is held back while an older transaction is still running)
   slow transaction commits
   poll: updated_at client sees [] <- the rename is lost: it is stamped before b.txt
   poll: feed client sees        ["a-renamed.txt","b.txt"]
   poll: feed client again       [] (nothing new; same sync token)
```

### Origins and further reading

- RFC: 9110 "HTTP Semantics", sections 8.8.3 (ETag), 13 (conditional requests: If-Match, If-None-Match, If-Range, evaluation order) and 14 (range requests, 206, 416). https://www.rfc-editor.org/rfc/rfc9110
- RFC: 6585 "Additional HTTP Status Codes" (428 Precondition Required, to prevent lost updates). https://www.rfc-editor.org/rfc/rfc6585
- RFC: 8288 "Web Linking" (the `Link` header, `rel="next"`). https://www.rfc-editor.org/rfc/rfc8288
- Draft: "The Idempotency-Key HTTP Header Field", IETF httpapi. https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
- Article: "Detecting the Lost Update Problem Using Unreserved Checkout", W3C note, 1999 (the If-Match pattern). https://www.w3.org/1999/04/Editing/
- Docs: "Transaction ID and Snapshot Information Functions", PostgreSQL 16 (`pg_current_xact_id`, `pg_current_snapshot`, `pg_snapshot_xmin`). https://www.postgresql.org/docs/16/functions-info.html#FUNCTIONS-PG-SNAPSHOT
- Docs: Amazon S3 presigned URLs for uploads. https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html
- Protocol: tus, resumable uploads over HTTP. https://tus.io/protocols/resumable-upload

---

## 08. Saga, orchestrated (`08-saga/`)

**Pain: partial failure.** Each service owns its database, so no transaction covers the whole order. A failure halfway leaves stock reserved and money taken for an order that will never ship.

**Reach for it when** one business operation spans services that each own their data, including long-running flows that wait (the `fraudHold` timer here).

**Do not reach for it when** the data lives in one database: use a transaction. The operation needs isolation, so nobody may see or act on the half-done state: a saga has none (ACD, not ACID), so draw the service boundary around that data instead. The flow has many branches, long waits or human steps: use a workflow engine (Temporal) rather than a hand-rolled step table. Other teams' services should react to the same facts rather than be commanded: choreograph it (12).

Places an order across inventory, payments and shipping, each with its own database, without a distributed transaction.

### Concepts

- **No transaction spans services**: each service owns its database (here, 4 real Postgres databases), so a `BEGIN ... COMMIT` cannot cover all three steps. Two-phase commit exists but couples every service's availability and is rarely used across services.
- **Saga**: a sequence of local transactions (`reserveInventory`, `chargePayment`, `createShipment`, with a `fraudHold` timer before shipping). Each commits on its own. If a later step fails, earlier ones are undone by **compensating actions** (`release`, `refund`), run in reverse order. Coined by Garcia-Molina and Salem ("Sagas", SIGMOD 1987) for long-lived transactions inside one database; microservices reuse the idea across databases.
- **Compensation is semantic, not a rollback**: a refund is a new fact; the charge still happened. Some steps cannot be compensated (an email already sent), so order steps as compensatable ones, then one pivot (the go/no-go step, here `createShipment`, which has no compensation), then retriable ones that must eventually succeed (Richardson's taxonomy).
- **Orchestration vs choreography**: here a central orchestrator (`src/orchestrator.ts`) tells each service what to do next. In choreography, services react to each other's events instead, each through its own outbox; 12 runs this same order flow that way. Orchestration is easier to follow and change; choreography has no central component.
- **Saga log**: the orchestrator persists `state` and `step` after every step in its own database. After a crash, it reloads unfinished sagas and continues forward or keeps compensating. This assumes a single orchestrator; with several, claim a saga first (`SELECT ... FOR UPDATE SKIP LOCKED` or a lease column), or run one active orchestrator under a leader lease (19).
- **Idempotent steps**: a crash between "step ran" and "log updated" means the step runs again on recovery. Each step and compensation is keyed by saga id (steps: `INSERT ... ON CONFLICT DO NOTHING`; compensations: `DELETE ... RETURNING`, `UPDATE ... WHERE status = 'charged'`), so running it twice has the effect of running it once. `reserve` puts its insert and stock update in one local transaction so the pair is all-or-nothing.
- **Trade-offs**: no isolation. Other transactions can see intermediate states (stock reserved, payment not yet taken). Countermeasures include semantic locks (a `PENDING` status) and ordering steps so the riskiest come first. Also, a failed or timed-out step may have committed anyway; real orchestrators retry it or also run its (idempotent) compensation.
- **Toy services**: every `-> HTTP` log line stands for a network call to a separate microservice with its own remote database. Here each service is a function in `src/services.ts`, and each database is a separate Postgres database in one local container.
- **Durable timer**: a saga that has to wait (a fraud hold, a payment deadline, days in real life) must not keep a process alive for that long. The `fraudHold` step (`holdSec` in the order) writes `state = 'waiting'` and `wake_at` to the saga log, and `runSaga` returns. The wait is now a row, so any process can crash or be redeployed without losing it.
- **Waker**: `src/waker.ts` polls every 5s, claims due sagas in one statement (`UPDATE ... SET state = 'running' WHERE state = 'waiting' AND wake_at <= now() RETURNING id`, so two wakers cannot claim the same saga) and calls `runSaga`, which continues at the step after the timer. It wakes up to one poll interval late. Deliberately missing: a waker that crashes after claiming leaves the saga in `running` with no owner (a lease with an expiry fixes that), plus retries, heartbeats for long steps, and waiting for an external event (a signal) instead of a time. Temporal's server is essentially this loop with those pieces added: durable timers, task queues with leases, and signals.

### Proof (`logs/08-saga.log`)

Payment failure compensates one step; shipping failure compensates two, in reverse:

```
      -> HTTP POST payments-service/charges/order-B
   [order-B] step 2 chargePayment: FAILED (card declined for 5000.00) -> compensate 1 completed step(s)
      -> HTTP DELETE inventory-service/reservations/order-B
   [order-B] compensate reserveInventory: ok
   [order-B] aborted

      -> HTTP POST shipping-service/shipments/order-C
   [order-C] step 4 createShipment: FAILED (address not deliverable: nowhere) -> compensate 3 completed step(s)
   [order-C] compensate fraudHold: timer, nothing to undo
      -> HTTP POST payments-service/charges/order-C/refund
   [order-C] compensate chargePayment: ok
      -> HTTP DELETE inventory-service/reservations/order-C
   [order-C] compensate reserveInventory: ok
   [order-C] aborted
```

The process is killed after charging order-D but before logging it. The log says step 1, yet the charge exists:

```
   [order-D] CRASH after chargePayment ran, before the saga log recorded it
 order-D | running   |    1 |

 saga_id | amount | status
 order-D |  42.00 | charged
```

A new process resumes from the log. It re-runs `chargePayment`, which is idempotent, and completes:

```
   [order-D] found running at step 1, resuming
      -> HTTP POST payments-service/charges/order-D
   [order-D] step 2 chargePayment: ok
   [order-D] step 3 fraudHold: no hold, skipped
      -> HTTP POST shipping-service/shipments/order-D
   [order-D] step 4 createShipment: ok
   [order-D] completed
```

order-E has a 30s fraud hold. The process that starts it parks it and exits:

```
   19:50:04 [order-E] step 3 fraudHold: sleep 30s -> saga log says waiting, wake_at 19:50:34; this process stops driving it
   19:50:04 timer process exits; order-E now exists only as a row
 order-E | waiting |    3 | 2026-09-27 19:50:34.125534+00
```

A first waker is killed 10s in and the row is untouched. A second waker process picks order-E up when it is due and finishes it:

```
   19:50:09 tick: order-E due in 25s
   19:50:14 waker #1 killed (exit 143)
 order-E | waiting |    3 | 2026-09-27 19:50:34.125534+00

## waker (pid 79440)
   19:50:14 tick: order-E due in 20s
   ...
   19:50:29 tick: order-E due in 5s
   19:50:34 [order-E] due, claimed (waiting -> running, 0.5s after wake_at because of the poll interval)
      -> HTTP POST shipping-service/shipments/order-E
   [order-E] step 4 createShipment: ok
   [order-E] completed
```

Every database ends consistent: stock `10 - 2 (A) - 1 (D) - 1 (E) = 6`, C refunded, D charged exactly once, B never charged, only A, D and E shipped:

```
 keyboard |         6

 order-A |  84.00 | charged
 order-C | 126.00 | refunded
 order-D |  42.00 | charged
 order-E |  42.00 | charged

 order-A | Paris
 order-D | Lyon
 order-E | Lille
```


### Origins and further reading

- Paper: "Sagas", Hector Garcia-Molina and Kenneth Salem, SIGMOD 1987. https://dl.acm.org/doi/10.1145/38713.38742
- Article: "Pattern: Saga", Chris Richardson, microservices.io. https://microservices.io/patterns/data/saga.html
- Talk: "Distributed Sagas: A Protocol for Coordinating Microservices", Caitie McCaffrey, J On The Beach 2017. https://www.youtube.com/watch?v=0UTOLRTwOX0
- Talk: "Using sagas to maintain data consistency in a microservice architecture", Chris Richardson, 2017. https://www.youtube.com/watch?v=YPbGW3Fnmbc
- Article: "The definitive guide to Durable Execution", Temporal blog (what Temporal adds on top of the timer and waker). https://temporal.io/blog/what-is-durable-execution
- Article: "Designing a Workflow Engine from First Principles", Maxim Fateev (Temporal). https://temporal.io/blog/workflow-engine-principles

---

## 09. Transactional outbox, polling relay (`09-outbox-polling/`)

**Pain: dual write.** The app must update its database and tell Kafka, two systems with no shared transaction. A crash between the two writes loses the event or publishes one for a change that never committed.

**Reach for it when** a service changes its own database and must reliably tell others what happened in business terms (`OrderPlaced`), and consumers can handle a duplicate: delivery is at least once. Start here; a polling relay covers most volumes.

**Do not reach for it when** consumers want every row change from any writer, not business events (10). Losing a notification is acceptable: publish best effort. The caller needs the other side's answer before it can reply: that is a synchronous call, not an event. Poll latency, query load or table cleanup already hurt (11).

The simplest reliable way to publish events. No Debezium: just a table and a loop.

### Concepts

- **The dual-write problem**: a service must update its database *and* tell other services (publish to Kafka). These are two systems with no shared transaction. Commit then publish: a crash in between loses the event. Publish then commit: a failed commit leaves an event for something that never happened. Retries do not fix this, because the process that would retry is the one that crashed.
- **Outbox table**: instead of publishing, the service inserts the event as a row in `outbox` *in the same transaction* as the business change (`emit()` in `src/app.ts`). One atomic write: both happen or neither does. The app never talks to Kafka.
- **Outbox row shape**: `id` (BIGSERIAL; the relay publishes in id order, and ids follow insert order, not commit order), `event_id` (uuid, the identity consumers dedupe on), `aggregate_id` (becomes the Kafka key, so one order's events stay ordered on one partition), `type`, `payload` (JSONB), `created_at`, `published_at` (null = not yet sent). A partial index on `published_at IS NULL` keeps the poll query cheap as the table grows.
- **Polling publisher (the relay)**: a separate process (`src/relay.ts`) loops: open a transaction, claim up to 10 unpublished rows, send them to Kafka, set `published_at`, commit. It stops when nothing is left (a real relay sleeps and polls again). Holding the transaction open during the send is the simplest correct form; production relays keep batches small or claim rows with a lease column instead.
- **`FOR UPDATE SKIP LOCKED`**: claiming rows locks them, and other relay instances skip locked rows instead of waiting. You can run several relays for throughput or availability without sending the same row twice concurrently. The price: ordering. Two relays can claim one order's events in different batches and send them in either order, so keep a single active relay (others on standby, elected as in 19) when per-aggregate order matters.
- **At-least-once delivery**: the send to Kafka and the `published_at` update cannot be atomic either. If the relay crashes after sending and before committing, the rows stay unpublished and are sent again on restart. Duplicates are possible; loss is not. The relay's order is deliberate: send first, mark second.
- **Idempotent consumer**: because of the above, consumers must dedupe. `src/consumer.ts` remembers processed `event_id`s and skips repeats. In real code that set is a `processed_events` table, updated in the same transaction as the consumer's own side effects.
- **Trade-offs vs 11 (CDC relay)**: polling is simple (Postgres + any broker, no Connect, no replication slot), but it adds latency (the poll interval), load on the DB, and a growing table you must clean up (delete or partition published rows). 11 removes all three at the cost of Debezium.

### Proof (`logs/09-outbox-polling.log`)

The app commits two events; bob's rolled back with his order. Before the relay runs, both rows are waiting:

```
 id |    type     | aggregate_id | published_at
  1 | OrderPlaced | 1            |
  2 | OrderPaid   | 1            |
```

Relay pass 1 is killed for real (`process.exit(1)`) after the Kafka send, before its commit. The rows are still unpublished, because the claim transaction died with the process:

```
relay: claimed + sent #1 OrderPlaced, #2 OrderPaid
relay: CRASH after send, before marking published (transaction never commits)
relay exited with 1

 id |    type     | published_at
  1 | OrderPlaced |
  2 | OrderPaid   |
```

Relay pass 2 re-sends them and marks them published:

```
relay: claimed + sent #1 OrderPlaced, #2 OrderPaid
relay: marked 2 published
relay: outbox drained
```

The consumer got each event twice (at-least-once) and processed each once (idempotent):

```
consumer: OrderPlaced key=1 event_id=<placed> payload={"total":"42.50","orderId":1,"customer":"alice"}
consumer: OrderPaid key=1 event_id=<paid> payload={"orderId":1}
consumer: DUPLICATE OrderPlaced event_id=<placed> skipped (idempotent consumer)
consumer: DUPLICATE OrderPaid event_id=<paid> skipped (idempotent consumer)
```


### Origins and further reading

- Article: "Pattern: Transactional outbox", Chris Richardson, microservices.io. https://microservices.io/patterns/data/transactional-outbox.html
- Article: "Pattern: Polling publisher", Chris Richardson, microservices.io. https://microservices.io/patterns/data/polling-publisher.html
- Book: *Microservices Patterns*, Chris Richardson, 2018. https://www.manning.com/books/microservices-patterns
- Article: "Revisiting the Outbox Pattern", Gunnar Morling. https://www.morling.dev/blog/revisiting-the-outbox-pattern/

---

## 10. CDC: WAL -> Debezium -> Kafka (`10-cdc-debezium/`)

**Pain: derived data drift.** Search indexes, caches and the warehouse must mirror the database, but dual writes from app code race, fail halfway and miss writes that bypass the app (scripts, manual SQL), while nightly batch copies are hours stale.

**Reach for it when** keeping derived copies in sync with the source of truth: search indexes (Elasticsearch, Meilisearch), cache invalidation, a data warehouse or lake, a new database during a migration (05), or publishing changes from code you cannot change. The consumer wants every row change, including ones made outside the app, and does not care why the row changed.

**Do not reach for it when** consumers need business intent (`OrderPaid`, not `status pending -> paid`): use an outbox (09, 11), or every consumer couples to your table schema. You want the audit log of record: the WAL knows the database role, not the user, and a dropped slot loses the changes made while it was gone, while 01's audit row commits with the change (`pgaudit` catches scripts with their role). Nobody will watch the replication slot: a stalled consumer makes Postgres keep WAL until the disk fills.

### Concepts

- **WAL (write-ahead log)**: before Postgres changes a data page, it writes the change to the WAL. The WAL is how Postgres survives crashes and feeds replicas. Every change is in it (even ones later rolled back), in write order; logical decoding reassembles each transaction and emits it at commit, in commit order.
- **`wal_level=logical`**: by default the WAL holds physical page changes. `logical` adds enough information to decode *row-level* changes (table, columns, values). Set in `docker-compose.yml`.
- **Logical decoding + `pgoutput`**: `pgoutput` is the decoder plugin built into Postgres (no extension needed). It turns WAL records into insert/update/delete messages for the tables listed in a **publication** (`dbz_publication`, created by Debezium; `publication.autocreate.mode=filtered` limits it to `table.include.list`, the default would be `FOR ALL TABLES`).
- **Replication slot**: a named cursor into the WAL (`debezium`). Postgres keeps WAL segments until the slot confirms it has consumed them (`confirmed_flush_lsn`), so the connector can go down and resume without losing changes. Operational catch: an abandoned slot makes WAL pile up on disk.
- **LSN (log sequence number)**: the position of a change in the WAL. It always increases, so it orders WAL records.
- **Initial snapshot**: on first start Debezium reads existing rows and emits them as `op=r` (SNAPSHOT), then streams from the slot's position. The table is empty here, so none appear.
- **`REPLICA IDENTITY FULL`**: by default updates and deletes carry only the primary key as the old row. `FULL` makes Postgres log the whole old row, which gives the `before` image.
- **Debezium**: a Kafka Connect source connector. It holds the slot, turns each row change into an event `{op, before, after, source: {lsn, txId, table}, ts_ms}` and publishes it to the topic `<topic.prefix>.<schema>.<table>` = `app.public.orders`, keyed by primary key (so all changes to one row stay in order on one partition).
- **Kafka Connect**: runs connectors, stores their config and offsets in Kafka topics (`connect_configs`, `connect_offsets`, `connect_statuses`). It is configured through a REST API, which `src/setup.ts` calls with `PUT /connectors/orders-connector/config`.
- **Why CDC**: the writer (`src/writer.ts`) is plain SQL and knows nothing about Kafka. Every writer is captured, including manual SQL, and only *committed* changes are emitted. So there is no "DB committed but publish failed" dual-write problem.
- **Trade-offs**: events are row diffs, not business intent (`status pending -> paid`, not `OrderPaid`), and they are coupled to your table schema. Schema changes are not decoded (an `ALTER TABLE` never appears as an event) and Debezium skips `TRUNCATE` by default. There are more moving parts (Kafka, Connect, a slot to monitor). Delivery is at-least-once, so consumers must be idempotent.

### Proof (`logs/10-cdc-debezium.log`)

What the writer did:

```
writer: INSERT order 1
writer: UPDATE order 1 status=paid
writer: one transaction -> UPDATE order 1 status=shipped + INSERT bob (expect same tx id)
writer: DELETE bob then ROLLBACK (expect no event: logical decoding only emits committed transactions)
writer: DELETE order 1
```

What arrived in Kafka:

```
consumer: INSERT lsn=22152232 tx=734 before=null after={"id":1,...,"status":"pending"}
consumer: UPDATE lsn=22152520 tx=735 before={...,"status":"pending"} after={...,"status":"paid"}
consumer: UPDATE lsn=22152688 tx=736 before={...,"status":"paid"} after={...,"status":"shipped"}
consumer: INSERT lsn=22152808 tx=736 before=null after={"id":2,"customer":"bob",...}
consumer: DELETE lsn=22153128 tx=738 before={...,"status":"shipped"} after=null
```

- The two changes committed together share `tx=736`.
- `tx=737` (DELETE bob + ROLLBACK) never appears, and bob is still in the table.
- The DELETE carries the full `before` row, thanks to `REPLICA IDENTITY FULL`.
- LSNs strictly increase.
- Transaction 737 exists and is `aborted` according to Postgres (`pg_xact_status`, in the log), so its absence is the rollback, not a gap.

The Postgres side of the pipe. The slot has advanced from where it was created to 22153000, past transactions 734 to 736; Debezium acknowledges positions on offset flushes, so it trails the most recent transaction (the DELETE at 22153128) slightly. The publication covers only `orders`:

```
logical                                     <- SHOW wal_level

 slot_name |  plugin  | slot_type | active | confirmed_flush_lsn | as_number
-----------+----------+-----------+--------+---------------------+-----------
 debezium  | pgoutput | logical   | t      | 0/1520728           |  22153000

     pubname     | schemaname | tablename |          attnames          | rowfilter
-----------------+------------+-----------+----------------------------+-----------
 dbz_publication | public     | orders    | {id,customer,status,total} |
```


### Origins and further reading

- Article: "Pattern: Transaction log tailing", Chris Richardson, microservices.io. https://microservices.io/patterns/data/transaction-log-tailing.html
- Talk: "Turning the database inside out with Apache Samza", Martin Kleppmann, Strange Loop 2014. https://www.youtube.com/watch?v=fU9hR3kiOK0 (transcript: https://martin.kleppmann.com/2015/03/04/turning-the-database-inside-out.html)
- Talk: "Change Data Streaming Patterns in Distributed Systems", Gunnar Morling, 2021. https://www.youtube.com/watch?v=CLv2EcYnr2g
- Book: *Designing Data-Intensive Applications*, Martin Kleppmann, 2017 (logs, CDC, derived data). https://dataintensive.net/

---

## 11. Transactional outbox, CDC relay (`11-outbox-debezium/`)

**Pain: polling overhead.** 09's relay adds poll latency and query load, and its outbox table keeps growing until something cleans it up.

**Reach for it when** you have 09's need and poll latency, query load or table cleanup start to hurt, or Debezium is already running for 10.

**Do not reach for it when** nobody is ready to run Kafka Connect and watch a replication slot: 09 is enough for most volumes. You would delete outbox rows at once but cannot afford to lose an event: a dropped slot then loses them for good, so keep rows until shipped and poll them, as 17 does.

Same outbox idea as 09, but the relay is Debezium reading the WAL (10) instead of a polling loop.

### Concepts

- **Log-tailing relay**: instead of polling `outbox`, Debezium reads outbox inserts from the WAL through a replication slot (10). No poll interval, no query load, no `published_at` column to maintain.
- **Outbox row shape** (Debezium's convention): `id` (event id, uuid), `aggregatetype` (routes to the topic), `aggregateid` (becomes the Kafka key, so all events of one order stay ordered on one partition), `type` (event name), `payload` (JSON).
- **EventRouter SMT**: a Kafka Connect transform. It unwraps Debezium's `{before, after, op}` envelope and emits just the payload to `outbox.event.<aggregatetype>`, with the event `id` and `eventType` as headers. Consumers see `OrderPaid {orderId}`, not a row diff. `setup.ts` relies on the defaults for routing, key and topic (`route.by.field=aggregatetype`, `table.field.event.key=aggregateid`, `route.topic.replacement=outbox.event.${routedByValue}`); only the payload expansion and the `eventType` header are configured.
- **Outbox vs raw CDC**: raw CDC (10) publishes table changes, so consumers couple to your schema and must guess intent. The outbox publishes explicit, versionable business events: the table is private, the event is the public contract.
- **Immediate cleanup**: the outbox row can be deleted in the same transaction it was inserted in. The insert is already in the WAL, so Debezium still publishes it, and EventRouter ignores deletes. The table never grows. Catch: this relies on the replication slot. If the connector is created after the writes, or the slot is dropped, Debezium re-snapshots the table and already-deleted events are gone for good; 09's polling table would still have them.
- **At-least-once + idempotent consumer**: same as 09. Debezium can re-send after a restart (it resumes from its last flushed offset), so consumers dedupe on the event `id` header (`seen` set in `src/consumer.ts`; no duplicate occurs in this run).
- **Trade-offs vs 09**: lower latency, no DB polling, no table cleanup, but Kafka Connect, Debezium and a replication slot to run and monitor. Both share the core limit: every write path must remember to emit.

### Proof (`logs/11-outbox-debezium.log`)

The app wrote four outbox rows. One was rolled back (bob), and in step 4 all of alice's rows were deleted: OrderShipped in the same transaction that inserted it, the two earlier ones after they had committed (their inserts are already in the WAL). The app also committed carol's order without an outbox row (the dual-write simulation).

```
   outbox <- OrderPlaced id=<alice-placed>
   outbox <- OrderPaid id=<alice-paid>
   outbox <- OrderPlaced id=<bob-placed>
   rejected: payment provider down, order 2 aborted
   outbox <- OrderShipped id=<alice-shipped>
   all outbox rows for this order deleted, OrderShipped in the transaction that inserted it (the WAL still has every insert)
   order 3 committed to Postgres
   process crashes before producer.send(OrderPlaced) -> nothing will ever publish it
```

Exactly the three committed events arrived, in order, keyed by order id, as business events:

```
consumer: outbox.event.order[0] key=1 eventType=OrderPlaced id=<alice-placed> payload={"total":"42.50","orderId":1,"customer":"alice"}
consumer: outbox.event.order[0] key=1 eventType=OrderPaid id=<alice-paid> payload={"orderId":1}
consumer: outbox.event.order[0] key=1 eventType=OrderShipped id=<alice-shipped> payload={"carrier":"UPS","orderId":1}
```

- bob's rolled-back `OrderPlaced` (`<bob-placed>`) never arrived, and bob has no order row.
- carol's order exists but has no event: that is the dual-write loss the outbox prevents.
- The `outbox` table has 0 rows, yet all three events were delivered.
- The only app topic is `outbox.event.order` (no raw `app.public.outbox`).

```
 id | customer | status  | total
  1 | alice    | shipped | 42.50
  3 | carol    | placed  |  5.00

 outbox_rows
           0
```


### Origins and further reading

- Article: "Reliable Microservices Data Exchange With the Outbox Pattern", Gunnar Morling, Debezium blog, 2019. https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/
- Docs: "Outbox Event Router", Debezium. https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html
- Talk: "Ins and Outs of the Outbox Pattern", Gunnar Morling, 2025. https://www.youtube.com/watch?v=PkrzOR_tIQI

---

## 12. Saga, choreographed (`12-choreographed-saga/`)

**Pain: one coordinator owns every reaction.** 08's orchestrator calls every service's API and holds the whole flow, so anything else that should happen after a step (an email, loyalty points, an analytics feed) is a change to that one component, and the team that owns it becomes the queue. Removing it naively (services calling each other, or publishing to Kafka straight from code) brings back partial failure and dual writes.

**Reach for it when** a few services, owned by different teams, react to each other's business events in a short, stable flow (three or four steps, one or two failure paths), and the events are useful beyond this one flow.

**Do not reach for it when** the flow has many steps, branches, timers or human steps, or changes often: every change touches several services, and no one place shows the flow; use 08 or a workflow engine. You need to answer "where is order X right now?" in one query, or to reason about the failure paths in one file: choreography spreads both across services. The services form cycles (here three pairs listen to each other): an orchestrator removes them.

08's order flow (reserve stock, charge, ship; release and refund on failure), same inputs and same final stock, with no orchestrator. Four services, each with its own database, outbox, relay and Kafka topic, react to each other's events.

### Concepts

- **Choreography**: no service tells another what to do. `orders` publishes `OrderPlaced`; `inventory` reacts and publishes `InventoryReserved`; `payments` reacts and publishes `PaymentCharged` or `PaymentFailed`; `shipping` reacts and publishes `ShipmentCreated` or `ShipmentFailed`. The flow is not written down anywhere: it is the sum of the `on:` maps in `src/services.ts`. The client's only call is `POST /orders`, which returns as soon as the order is `pending`.
- **Compensation by events**: `PaymentFailed` makes `inventory` release and `orders` reject. `ShipmentFailed` makes `payments` refund, whose `PaymentRefunded` makes `inventory` release. That is the reverse order, as in 08, but each hop is a service reacting to an event, not a loop in one process.
- **Outbox per service, one transaction per reaction**: `handle()` in `src/bus.ts` opens one local transaction. It inserts the incoming `event_id` into `processed_messages`, runs the effect (reservation, charge, shipment) and inserts the outgoing event into that service's `outbox`. A relay per service (09's polling relay) sends the outbox to the service's topic. There is no dual write: effect, "I handled this" and "tell the others" commit together or not at all.
- **Offset commit vs redelivery**: Kafka learns that a consumer handled a message only when the consumer commits its offset, after the handler returns. The run kills `inventory` right after its transaction commits and before the offset commit. On restart Kafka redelivers `OrderPlaced`; its `event_id` is already in `processed_messages`, so the handler is skipped and nothing is reserved twice. The `InventoryReserved` row that the crashed transaction had committed is published by the relay, and the saga goes on. The ~5.7s gap in order-D's timeline is the restart plus the consumer group rebalance (session timeout 6s).
- **Ordering is per partition, not per saga**: events are keyed by order id, so one order's events stay in order within one topic (order-A lands on partition 2 of every topic, since all four have 3 partitions). Across topics there is no order at all. When `orders` stops reading `inventory-events` for a while (a slow partition, a lagging consumer), it sees `PaymentCharged` and `ShipmentCreated` for order-E before `InventoryReserved`.
- **The order service's own state machine**: `orders` tracks `pending -> reserved -> paid -> completed`, or `rejected`, from the events it hears. It only moves forward (a rank per status). An event that skips ahead jumps the status, and a late event that would move it back is recorded as processed and ignored. Duplicates never reach the state machine: `processed_messages` drops them first. The status is the order service's view, not the saga's state: order-C is `rejected` while the refund and the release are still in flight in two other services.
- **No single place knows the saga**: 08 answers "where is order-C?" with one row. Here the answer is spread over four outboxes and four `processed_messages` tables. Every event carries a correlation id (the order id: Kafka key and `outbox.order_id`) and a causation id (the event it reacted to). `src/timeline.ts` joins them into one timeline. In production that is distributed tracing or a consumer of every topic, and someone has to build and run it. `InventoryReleased` is processed by nobody, so no service ever learns that the compensation finished.
- **Cyclic dependencies**: the wiring printed at startup finds three pairs that listen to each other: `orders <-> inventory`, `inventory <-> payments`, `payments <-> shipping`. Each side must know the other's event names and payloads, so a schema change on one side is a coordinated change on both. Events also carry the whole order (event-carried state), so `shipping` receives the amount it never uses.
- **Changing the flow is harder**: in 08, adding a fraud check between reserve and charge is one line in `STEPS`. Here `payments` must stop reacting to `InventoryReserved` and react to `FraudCleared`; `inventory` must also release on `FraudRejected`; the `orders` state machine gains a status. That is three services redeployed in a safe order, while events published under the old flow are still in the topics.
- **When orchestration (08) is better**: long or branching flows, timers (08's durable `fraudHold` has no natural home here), human steps, flows that change often, and any need to see or query one saga's state. A common split is to orchestrate inside one team's bounded context and use events between contexts.
- **Toy services**: the four services run in one process with separate pools, relays and consumer groups. Each database is a separate Postgres database in one container. The demo waits for "settled" (outboxes drained, `processed_messages` counts stable) between scenarios so the log reads in order. Handlers are not retried on errors, and an out-of-stock path is left out.

### Proof (`logs/12-choreographed-saga.log`)

The wiring, read from the handlers. No step table, and three cycles:

```
   orders    publishes order-events (OrderPlaced), listens to inventory-events, payment-events, shipping-events
   inventory publishes inventory-events (InventoryReserved, InventoryReleased), listens to order-events, payment-events
   payments  publishes payment-events (PaymentCharged, PaymentFailed, PaymentRefunded), listens to inventory-events, shipping-events
   shipping  publishes shipping-events (ShipmentCreated, ShipmentFailed), listens to payment-events
   cycles, each side depends on the other's events: orders <-> inventory, inventory <-> payments, payments <-> shipping
```

The happy path, all by reaction. Every order-A event is on partition 2 of its topic:

```
   [orders] order-A pending, outbox <- OrderPlaced; the HTTP call returns here, the rest happens by events
   [inventory] <- OrderPlaced order-A (order-events p2 @0): reserved 2 keyboard, outbox <- InventoryReserved
   [orders] <- InventoryReserved order-A (inventory-events p2 @0): order pending -> reserved
   [payments] <- InventoryReserved order-A (inventory-events p2 @0): charged 84.00, outbox <- PaymentCharged
   [orders] <- PaymentCharged order-A (payment-events p2 @0): order reserved -> paid
   [shipping] <- PaymentCharged order-A (payment-events p2 @0): shipment to Paris, outbox <- ShipmentCreated
   [orders] <- ShipmentCreated order-A (shipping-events p2 @0): order paid -> completed
```

Shipping fails for order-C; refund, then release, each triggered by an event:

```
   [shipping] <- PaymentCharged order-C (payment-events p0 @1): address not deliverable: nowhere, outbox <- ShipmentFailed
   [orders] <- PaymentCharged order-C (payment-events p0 @1): order reserved -> paid
   [payments] <- ShipmentFailed order-C (shipping-events p0 @0): refunded 126.00, outbox <- PaymentRefunded
   [orders] <- ShipmentFailed order-C (shipping-events p0 @0): order paid -> rejected
   [inventory] <- PaymentRefunded order-C (payment-events p0 @2): released 3 keyboard, outbox <- InventoryReleased
```

`inventory` is killed after its transaction commits, before its offset commit. The reservation, the unpublished `InventoryReserved` and the processed `OrderPlaced` all exist, yet Kafka has no committed offset for that partition:

```
   [inventory] <- OrderPlaced order-D (order-events p1 @0): reserved 1 keyboard, outbox <- InventoryReserved
   [inventory] CRASH after the transaction committed, before Kafka got the offset of OrderPlaced order-D

 order-D  | keyboard |   1
 InventoryReserved | order-D  |
 OrderPlaced | order-D

TOPIC             PARTITION CURRENT-OFFSET LOG-END-OFFSET LAG
order-events      1         -              1              -
```

A new process gets `OrderPlaced` again and skips it; the saga continues from the committed outbox row:

```
   [inventory] <- OrderPlaced order-D (order-events p1 @0): DUPLICATE event_id=f0104b91 already in processed_messages, skipped
   [orders] <- InventoryReserved order-D (inventory-events p1 @0): order pending -> reserved
   [payments] <- InventoryReserved order-D (inventory-events p1 @0): charged 42.00, outbox <- PaymentCharged
   ...
   [orders] <- ShipmentCreated order-D (shipping-events p1 @0): order paid -> completed
```

With `orders` paused on `inventory-events`, events for order-E arrive out of order; the state machine jumps forward and ignores the late one:

```
   [orders] <- PaymentCharged order-E (payment-events p0 @3): order pending -> paid (jumped: an earlier event has not arrived yet)
   [orders] <- ShipmentCreated order-E (shipping-events p0 @1): order paid -> completed
   [orders] resumed on inventory-events
   [orders] <- InventoryReserved order-E (inventory-events p0 @4): order is already completed, a late InventoryReserved cannot move it back to reserved, ignored
```

order-C's saga, rebuilt from four databases. The orders table says `rejected`, and nobody consumes the event that ends the compensation:

```
   order-C (the orders table only says: rejected)
   +    0ms orders    OrderPlaced       after the HTTP call                processed by inventory
   +   53ms inventory InventoryReserved after orders OrderPlaced           processed by orders, payments
   +  157ms payments  PaymentCharged    after inventory InventoryReserved  processed by orders, shipping
   +  254ms shipping  ShipmentFailed    after payments PaymentCharged      processed by orders, payments
   +  353ms payments  PaymentRefunded   after shipping ShipmentFailed      processed by inventory
   +  359ms inventory InventoryReleased after payments PaymentRefunded     processed by nobody
```

Same end state as 08: stock `10 - 2 (A) - 1 (D) - 1 (E) = 6`, C refunded, B never charged, only A, D and E shipped, D processed once:

```
 keyboard |         6

 order-A  |  84.00 | charged
 order-C  | 126.00 | refunded
 order-D  |  42.00 | charged
 order-E  |  42.00 | charged

 order-A  | Paris
 order-D  | Lyon
 order-E  | Lille

 OrderPlaced | order-D
(1 row)
```

### Origins and further reading

- Article: "Pattern: Saga", Chris Richardson, microservices.io (choreography-based and orchestration-based sagas). https://microservices.io/patterns/data/saga.html
- Article: "Saga design pattern", Azure Architecture Center, Microsoft (choreography vs orchestration trade-offs, including the risk of cyclic dependencies). https://learn.microsoft.com/en-us/azure/architecture/patterns/saga
- Article: "Pattern: Idempotent Consumer", Chris Richardson, microservices.io (the processed-message table in the handler's transaction). https://microservices.io/patterns/communication-style/idempotent-consumer.html
- Article: "What do you mean by 'Event-Driven'?", Martin Fowler, 2017 (a flow over event notifications is not explicit in any program text). https://martinfowler.com/articles/201701-event-driven.html
- Talk: "Complex Event Flows in Distributed Systems", Bernd Ruecker, QCon London 2019. https://www.infoq.com/presentations/event-flow-systems/
- Article: "How to tame event-driven microservices", Bernd Ruecker, 2019 (adding a step to an event chain still means changing and redeploying other services). https://www.infoworld.com/article/2260429/how-to-tame-event-driven-microservices.html
- Article: "Choreography vs Orchestration in the land of serverless", Yan Cui, 2020 (orchestrate within a bounded context, choreograph between them). https://theburningmonk.com/2020/08/choreography-vs-orchestration-in-the-land-of-serverless/

---

## 13. Partitioning, one server (`13-partitioning/`)

**Pain: table too big.** One huge table means huge indexes, slow vacuum and expensive retention deletes.

**Reach for it when** one table got big enough that indexes, vacuum or retention hurt, and the hot queries filter on one key. Old data expires by time (`RANGE` by month, then `DROP` old partitions instead of a huge `DELETE`).

**Do not reach for it when** the table is small or a better index would fix the slow query: partitioning adds planning cost and rules for nothing. Most queries do not filter on the partition key, so each one scans every partition. You would cut it into thousands of small partitions: planning time and memory grow with the count. You need more CPU, RAM or write throughput: it is still one machine (14).

Splits one table into four on the same Postgres. First of two steps: here the split is local; in 14 each piece moves to its own server.

### Concepts

- **Declarative partitioning**: `orders` is a parent with no storage of its own (`SELECT count(*) FROM ONLY orders` is 0). `PARTITION BY HASH (customer_id)` plus one `CREATE TABLE ... PARTITION OF orders FOR VALUES WITH (MODULUS 4, REMAINDER n)` per piece. The app reads and writes `orders`; Postgres picks the partition. `HASH` spreads keys evenly; `RANGE` (by month, for retention: `DETACH`/`DROP` an old month instantly instead of a huge `DELETE`) and `LIST` (by region, tenant) are the other two kinds.
- **Partition key**: the column the split is based on. Choose it from the queries: every hot query should filter on it. The same key becomes the shard key in 14.
- **Pruning**: `WHERE customer_id = 'alice'` plans a scan of one partition. A query without the key (`WHERE item = 'lamp'`) becomes an `Append` over all partitions. In 14 the same query would have to go to every shard.
- **Uniqueness includes the key**: each partition has its own indexes, so there is no global index. A primary key or unique constraint must contain the partition key, which is why the key is `(customer_id, id)`; `UNIQUE (id)` is rejected.
- **Still one server**: one transaction can touch several partitions and rolls back atomically, and changing the key moves the row between partitions in one statement. Both stop being free once the pieces live on different servers (14).
- **What it does not buy**: CPU, RAM, disk and write throughput are those of one machine. Partitioning makes big tables manageable (smaller indexes, vacuum per partition, cheap retention); it does not scale out.
- **Uneven with few keys**: 5 customers over 4 partitions left `orders_p3` empty. Hash evens out with many keys, not few, and one very large customer stays one hot partition.

### Proof (`logs/13-partitioning.log`)

The app inserts into `orders`, Postgres routes; the key lookup is pruned to one partition, the non-key one scans all four:

```
   alice keyboard -> orders_p1 (id 1)
   bob   screen   -> orders_p2 (id 3)
   dave  chair    -> orders_p0 (id 5)

     Bitmap Heap Scan on orders_p1 orders
       Recheck Cond: (customer_id = 'alice'::text)

     Append
       ->  Seq Scan on orders_p0 orders_1
       ->  Seq Scan on orders_p1 orders_2
       ->  Seq Scan on orders_p2 orders_3
       ->  Seq Scan on orders_p3 orders_4
```

No global uniqueness, but atomic transactions across partitions (alice's insert in `orders_p1` rolls back with bob's failed one in `orders_p2`):

```
   rejected: unique constraint on partitioned table must include all partitioning columns

   rejected: null value in column "item" of relation "orders_p2" violates not-null constraint
   alice's cable rows after rollback: 0
```


### Origins and further reading

- Docs: "Table Partitioning", PostgreSQL documentation. https://www.postgresql.org/docs/current/ddl-partitioning.html
- Talk: "PostgreSQL Partitioning: Slicing and Dicing for Performance and Easier Maintenance", Ryan Booz, POSETTE 2024. https://www.youtube.com/watch?v=dKJyMj_P-XA
- Slides: "Declarative Partitioning Has Arrived!", Amit Langote and Ashutosh Bapat, PGConf.ASIA 2017 (Langote led the Postgres 10 work). https://www.pgconf.asia/JA/2017/wp-content/uploads/sites/2/2017/12/D2-A4-2.pdf
- Article: "Partitioning with Native Postgres and pg_partman", Crunchy Data. https://www.crunchydata.com/blog/native-partitioning-with-postgres

---

## 14. Sharding with read replicas (`14-sharding-replicas/`)

**Pain: one-machine ceiling.** Writes, storage and reads eventually exceed one Postgres server, and partitioning (13) does not help because it stays on that server.

**Reach for it when** one server can no longer hold the data or absorb the writes, after a bigger machine, partitioning (13) and replicas, and almost every query stays within one key (tenant, customer).

**Do not reach for it when** a bigger machine, partitioning (13) or read replicas would do: sharding is the most expensive step to undo. Transactions or joins routinely span shard keys: pick another key, and send cross-shard reports to a warehouse. The key is skewed, so one tenant or one hot value outgrows its shard (move that tenant to its own database instead, 15). Every read must see the latest write: serve it from the primary, not a replica.

The four partitions of 13, reduced to two, each moved onto its own server (a shard), and each shard given read replicas. Everything is vanilla Postgres plus a small router in the app. Scope: no query spans two shards.

### Concepts

- **Shard = partition on its own server**: same `orders` table, same key, but now two independent Postgres primaries (ports 55441, 55442) that know nothing about each other. Postgres no longer routes: the app does (`src/router.ts`, `md5(customer_id) % 2`). Nothing stops a buggy caller from writing bob into the wrong shard; the router is the only guard.
- **What is config and what is code**: replication is config. What it actually needs: a `REPLICATION` role, a `pg_hba` line for it (`all` does not match replication connections) and `pg_basebackup -R` on the replica (writes `standby.signal` + `primary_conninfo`). `wal_level=replica` and `hot_standby=on` are Postgres 16 defaults, set explicitly in `docker-compose.yml` for visibility. Sharding is code: shard choice, write/read routing, replica discovery. Postgres has no built-in multi-server sharding. Its closest built-in piece is `postgres_fdw` foreign tables as partitions, which gets routing and pruning but no cross-shard atomicity; Citus is the extension that does the full job.
- **Streaming replication**: each replica connects to its primary and replays its WAL (10) byte for byte, so it is an exact, read-only copy of that shard (`cannot execute INSERT in a read-only transaction`). It is asynchronous by default: the primary commits without waiting for replicas.
- **One writer per shard (CP writes)**: every write for a key goes to one primary, so writes to a shard are serialized in one place and never conflict. When that primary is unreachable, writes to that shard fail instead of going somewhere else: consistency over availability. The other shard keeps accepting writes, so an outage costs a fraction of the keys, not all of them.
- **Replicas answer anyway (AP reads)**: a lagging or cut-off replica still answers, with the data it has replayed so far. Reads stay available and are eventually consistent. What that costs: no read-your-writes (step 5: alice's write committed, the next read said 2 orders, not 3) and two reads can go backwards in time if they hit different replicas. Where a read must be fresh, send it to the primary, or wait until the replica's `pg_last_wal_replay_lsn()` passes the write's LSN (what `waitForReplay` does).
- **CAP shorthand**: "CP writes / AP reads" is per operation (PACELC-style), not a CAP class of the whole system. Strictly, clients reading async replicas never get linearizability even without a partition, and "CP" here means single leader: unavailable when the leader is lost, whether by crash or partition.
- **Lag**: `pg_last_wal_receive_lsn()` vs `pg_last_wal_replay_lsn()` on the replica, `replay_lsn` in `pg_stat_replication` on the primary. Step 5 pauses replay to make lag deterministic: the WAL has arrived, it is just not applied yet.
- **Retained WAL**: without a replication slot, the primary keeps only `wal_keep_size` (128MB here) of old WAL. A replica down longer than that can never catch up and must be re-cloned, and nothing here notices (it stays healthy and serves ever older data). A slot per replica retains WAL until it is consumed, at the cost of filling the primary's disk if a replica never comes back (cap with `max_slot_wal_keep_size`).
- **Scaling reads**: a new replica is `pg_basebackup` + start, with no change on the primary. Each streaming replica holds one WAL sender and a running `pg_basebackup -X stream` two, so `max_wal_senders=10` (the default) caps a shard at about 8 replicas. Raising it on the primary means raising it on every replica too: a hot standby refuses to start with a lower value than its primary. Here `docker compose --scale` starts it and the router discovers it from `docker compose ps` (in production: DNS, a service registry or a proxy such as pgcat or HAProxy). Replicas scale reads only. Writes scale only by adding shards.
- **No failover, on purpose**: promoting a replica (`pg_promote()`, or Patroni/repmgr automatically) would bring writes back, but with async replication any commits the replica had not received are lost, and a primary that was only partitioned away (not dead) could keep taking writes: split brain. Failover needs fencing and a consensus store (etcd for Patroni). Here the shard just waits for its primary; after `docker compose start` the replicas reconnect by themselves.
- **Replica names**: `pg_stat_replication.application_name` is the container id (`$HOSTNAME`), because scaled containers share one config; the router names them from compose's container number instead.
- **Per-shard ids**: each primary has its own `BIGSERIAL`, so `id 1` exists on both shards. That is why the key stays `(customer_id, id)`; globally unique ids need UUIDs or a shard prefix.
- **Deliberately missing**: queries across shards (fan-out and merge in the router), transactions across shards (sagas, 08, or two-phase commit) and resharding. With `% N`, going from 2 to 3 shards moves about two thirds of the keys. Real systems hash into many fixed buckets and map buckets to shards, so resharding moves whole buckets.

### Proof (`logs/14-sharding-replicas.log`)

Writes land on the key's primary; replicas reject writes and share the reads:

```
   alice keyboard -> shard0-primary (id 1)
   dave  chair    -> shard1-primary (id 1)

   shard0-replica-1 rejected: cannot execute INSERT in a read-only transaction

   read alice -> shard0-replica-1: 2 orders
   read alice -> shard0-replica-2: 2 orders
```

With replay paused on one replica, the committed write is visible on the primary and the other replica only. The router still serves the stale one, and after resume it converges:

```
   shard0-primary     3 orders (source of truth)
   shard0-replica-1   2 orders
   shard0-replica-2   3 orders
   read alice -> shard0-replica-1: 2 orders
   read alice -> shard0-replica-2: 3 orders

   shard0-replica-1   3 orders
```

After `--scale shard0-replica=4 --scale shard1-replica=3`, reads spread over the new replicas:

```
   shard 0 (4 replicas), 8 reads of alice: shard0-replica-1=2, shard0-replica-2=2, shard0-replica-3=2, shard0-replica-4=2
   shard 1 (3 replicas), 6 reads of dave: shard1-replica-1=2, shard1-replica-2=2, shard1-replica-3=2
```

With `shard1-primary` stopped, its writes fail, shard 0 is unaffected, and shard 1's replicas keep answering without being promoted:

```
   write dave -> shard1-primary rejected: connect ECONNREFUSED ::1:55442, connect ECONNREFUSED 127.0.0.1:55442
   write alice -> shard0-primary ok (id 6): the other shard is unaffected

   read dave -> shard1-replica-1: 1 orders (in recovery: true)
```


### Origins and further reading

- Book: *Designing Data-Intensive Applications*, Martin Kleppmann, 2017 (chapter 5 replication, chapter 6 partitioning, in the first edition; a second edition with Chris Riccomini came out in 2026). https://dataintensive.net/
- Article: "Herding elephants: lessons learned from sharding Postgres at Notion", Notion, 2021. https://www.notion.com/blog/sharding-postgres-at-notion
- Article: "How Figma's databases team lived to tell the scale", Figma, 2024 (vertical split first, horizontal sharding later). https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/
- Talk: "Scaling Instagram Infrastructure", Lisa Guo, QCon 2016/2017. https://www.youtube.com/watch?v=hnpzNAPiC0E

---

## 15. Multi-tenancy: pool, bridge, silo (`15-multi-tenancy/`)

**Pain: one tenant sees another's data.** A SaaS database holds many customers. One forgotten `WHERE tenant_id`, one pooled connection that kept the previous request's tenant, or one foreign key that points across tenants, and a customer reads or writes someone else's rows. One big tenant can also slow everyone down.

**Reach for it when** many customers share one product and one codebase, and you have to choose, per tenant, how strongly their data is separated: pool (shared tables, `tenant_id`, Row-Level Security) for many small tenants, bridge (a schema per tenant) for tens to a few hundred, silo (a database per tenant) for the few that need their own restore, deletion, region or capacity.

**Do not reach for it when** there is one customer, or tenants never share infrastructure (one deployment per customer is a silo without the router). You need isolation against a compromised database superuser or a noisy host: only separate servers or accounts give that. You want RLS as the only guard with the app connecting as the table owner or a superuser: it filters nothing for them.

Three isolation models on one Postgres, named as in the AWS SaaS whitepapers: pool, bridge, silo. The pool starts from a naive first schema and each pitfall is shown failing, then fixed. The bridge runs schema-per-tenant with a migration loop. The silo routes tenants to their own databases, and the biggest pooled tenant moves into one. Three roles: `postgres` (superuser), `migrator` (owns every table) and `app` (not owner, not superuser, no `BYPASSRLS`), which is what the application uses.

### Concepts

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

### Proof (`logs/15-multi-tenancy.log`)

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

### Origins and further reading

- Docs: "Row Security Policies", PostgreSQL documentation (owner and superuser bypass, `FORCE`, and referential integrity checks bypassing row security, with the covert-channel warning). https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Docs: `row_security`, "Client Connection Defaults", PostgreSQL documentation. https://www.postgresql.org/docs/current/runtime-config-client.html
- Whitepaper: "SaaS Tenant Isolation Strategies: Isolating Resources in a Multi-Tenant Environment", AWS (silo, pool, and bridge as a mix of the two). https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/saas-tenant-isolation-strategies.html
- Whitepaper: "SaaS Storage Strategies", AWS, archived (silo, bridge and pool for data; bridge as separate tables or schemas per tenant in one database). https://docs.aws.amazon.com/whitepapers/latest/multi-tenant-saas-storage-strategies/saas-partitioning-models.html
- Guide: "Architectural approaches for storage and data in multitenant solutions", Azure Architecture Center (noisy neighbors, per-tenant schema versions, restore and offboarding). https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/storage-data
- Guide: "Multi-tenant Applications", Citus documentation (tenant id in every primary and foreign key). https://docs.citusdata.com/en/stable/use_cases/multi_tenant.html

---

## 16. SERIALIZABLE: when it is a must (`16-serializable/`)

**Pain: write skew.** Concurrent transactions each check a rule over several rows ("fewer than 10 tickets sold?", "someone else still on call?"), each write a different row, and all commit, so the rule breaks. Postgres's default READ COMMITTED, and even REPEATABLE READ, let it through.

**Reach for it when** an invariant spans several rows or depends on rows that do not exist yet (capacity, overbooking, on-call rules) and cannot be a constraint or a lock on one parent row, or when there are too many such rules to find and guard each one by hand.

**Do not reach for it when** the rule is about one row, or is uniqueness or no overlap: a conditional `UPDATE`, `FOR UPDATE` or a constraint (`UNIQUE`, `EXCLUDE`) is enough. The app cannot retry the whole transaction on `40001`: SERIALIZABLE then turns races into errors users see. Many writers hit the same hot spot: aborts and retries pile up, so lock the parent row instead (scenario 8). Some writers of those tables would stay at READ COMMITTED: SSI only protects transactions that all run SERIALIZABLE.

Never sell more than we have: 10 keyboards or 10 concert tickets, 20 buyers at once. Back to one server: isolation levels are a guarantee of one Postgres, so under sharding (14) the rule must live inside one shard (here, `event_id` as the shard key).

### Concepts

- **Postgres's three levels** (READ UNCOMMITTED behaves as READ COMMITTED; no level shows dirty reads):
  - `READ COMMITTED` (default): each statement sees what was committed when it started.
  - `REPEATABLE READ`: snapshot isolation. One snapshot for the whole transaction, so it also hides other transactions' new rows (stronger than the SQL standard, which allows phantoms here). First updater wins: a transaction that updates, deletes or locks (`FOR UPDATE`) a row another transaction is changing waits for it; if that one commits, the waiter gets `40001`, if it rolls back, the waiter goes ahead.
  - `SERIALIZABLE` (SSI, Serializable Snapshot Isolation): REPEATABLE READ plus tracking of read/write dependencies between concurrent transactions. It aborts one transaction at least whenever the result could differ from running them one at a time (sometimes more often, see false positives).
- **Lost update** (1): read a value, compute in the app, write it back. Two buyers both read 10 and both write 9. Under READ COMMITTED 20 buyers were told "sold" and the stock only dropped by 1. The conflict is on **one row**.
- **One-row rules do not need SERIALIZABLE**:
  - `REPEATABLE READ` + retry (2): the second writer of the row is aborted, retries and reads the new stock.
  - One conditional statement (3): `UPDATE ... SET stock = stock - 1 WHERE stock > 0`. The row lock makes concurrent updates wait, and READ COMMITTED re-checks the `WHERE` against the committed row before writing. No retry at all.
  - `SELECT ... FOR UPDATE` then update: same idea, in two statements.
- **Uniqueness does not need it either** (4): for one specific seat the app's "is A1 free?" check is still racy, but `UNIQUE (event_id, seat)` rejects every second insert at any isolation level (under SERIALIZABLE the loser may get `40001` instead of the unique violation `23505`, so handle both). Prefer a constraint whenever the rule can be expressed as one (`UNIQUE`, `CHECK`, `EXCLUDE USING gist` for "no overlapping bookings").
- **Write skew** (5, 6): the rule spans many rows or depends on rows that do not exist yet. "Count tickets, if fewer than capacity, insert one." Every buyer reads 9 or fewer, every buyer inserts a different new row, and no two transactions write the same row. Nothing conflicts, so READ COMMITTED oversells, and so does REPEATABLE READ: its snapshot keeps reads stable but still does not show the others' inserts. Locking the counted ticket rows cannot help: the rows that would conflict do not exist yet (and `SELECT count(*) ... FOR UPDATE` is rejected: `FOR UPDATE is not allowed with aggregate functions`). Lock a parent row instead (8). Classic cases: capacity and overbooking, "at least one doctor on call", "balance across accounts stays positive", "username not taken" without a unique index.
- **SERIALIZABLE fixes write skew** (7): SSI takes SIREAD locks on what each transaction scanned (here index and heap pages, not an exact range) and records a read/write dependency when a concurrent transaction writes into them without the reader having seen it. When one transaction has such a dependency both in and out (a "dangerous structure"), one side is aborted with `could not serialize access due to read/write dependencies among transactions` (`40001`). The rule holds with no extra lock in the code. The cost:
  - **Retries are mandatory**: any statement, `COMMIT` included, can raise `40001`. The app must retry the whole transaction, not the failing statement (`withRetry` in `src/db.ts`).
  - **Wasted work under contention**: 20 buyers on one event caused about 140 aborts in this run (the exact number varies). SSI is cheap when conflicts are rare, not on a hot spot.
  - **Everyone must opt in**: the check only covers transactions that are themselves SERIALIZABLE. One READ COMMITTED writer on the same tables slips past it.
  - **False positives**: SIREAD locks cover whole pages for index and bitmap scans, and are promoted to coarser locks past `max_pred_locks_per_transaction`, so buyers of two different events sharing a page can abort each other. And a dangerous structure triggers an abort before a real cycle is proven.
  - **Act only after `COMMIT`**: a SERIALIZABLE transaction's reads are only guaranteed consistent once it commits. `buyByCount` tells the buyer "sold out" from an uncommitted read, which is safe here only because the ticket count never goes down.
  - **Not on replicas**: a hot standby (14) refuses SERIALIZABLE, so reads served by replicas are outside SSI. `SERIALIZABLE READ ONLY DEFERRABLE` on the primary gives long reports a snapshot that can never abort.
- **Materializing the conflict** (8): turn the many-row rule into a one-row lock. `SELECT ... FROM events WHERE id = 'concert' FOR UPDATE` first, then count and insert, all under READ COMMITTED. Buyers queue on the event row: no aborts, no retries, but no parallelism per event. A `sold` counter column (`UPDATE events SET sold = sold + 1 WHERE id = $1 AND sold < capacity`, in the same transaction as the insert) is the same idea: buyers still queue on the row, but hold the lock for less time since there is no `count(*)`. Every writer must go through it, and refunds must decrement it.
- **Choosing**: the rule is on one row → conditional `UPDATE` or `FOR UPDATE`. The rule is uniqueness or no overlap → a constraint. The rule spans rows and has one natural parent → lock the parent. The rule spans rows with no single parent, or there are many such rules and you do not want to find every one → `SERIALIZABLE` everywhere, plus a retry loop.

### Proof (`logs/16-serializable.log`)

The lost update oversells under READ COMMITTED; write skew oversells under both READ COMMITTED and REPEATABLE READ:

```
## 1. Lost update (READ COMMITTED)
   20 buyers: 20 told "sold", 0 told "sold out"
   database: 1 recorded as sold for 10 available -> OVERSOLD
   stock left: 9 (every buyer read 10 and wrote 9)

## 5. Write skew (READ COMMITTED)
   database: 20 recorded as sold for 10 available -> OVERSOLD

## 6. Write skew (REPEATABLE READ)
   database: 20 recorded as sold for 10 available -> OVERSOLD
```

The same count-then-insert code is correct once it runs SERIALIZABLE with retries, and so is the parent-row lock under READ COMMITTED:

```
## 7. Needed: SERIALIZABLE, with retries
   20 buyers: 10 told "sold", 10 told "sold out"
   database: 10 recorded as sold for 10 available -> correct

## 8. Alternative: lock the parent row
   20 buyers: 10 told "sold", 10 told "sold out"
   database: 10 recorded as sold for 10 available -> correct
```

Each level raises its own `40001`: REPEATABLE READ for two writers of one row, SERIALIZABLE for a read/write dependency:

```
   aborted with: could not serialize access due to concurrent update
   aborted with: could not serialize access due to read/write dependencies among transactions
```


### Origins and further reading

- Paper: "Serializable Isolation for Snapshot Databases", Michael J. Cahill, Uwe Röhm, Alan Fekete, SIGMOD 2008. https://dl.acm.org/doi/10.1145/1376616.1376690
- Paper: "Serializable Snapshot Isolation in PostgreSQL", Dan R. K. Ports and Kevin Grittner, VLDB 2012. https://arxiv.org/abs/1208.4179
- Talk: "Transactions: myths, surprises and opportunities", Martin Kleppmann, Strange Loop 2015. https://www.youtube.com/watch?v=5ZjhNTM8XU8
- Article and repo: "Hermitage: Testing the 'I' in ACID", Martin Kleppmann, 2014. https://martin.kleppmann.com/2014/11/25/hermitage-testing-the-i-in-acid.html

---

## 17. Audit trail through the outbox (`17-audit-outbox/`)

**Pain: scattered audit logs.** Each service can audit itself in the same transaction (01), but compliance and support need one trail across services, with the actor, that cannot miss a change made through the app or be edited afterwards. Sending it to a central store straight from app code is a dual write that loses events (09).

**Reach for it when** the audit trail of record spans several services and needs the actor and the reason from the app, a guarantee that no change made through the app exists without its audit event, and one central, append-only store.

**Do not reach for it when** there is one service and one database: 01's audit table is enough, with no shipper to run. You need to catch writes that bypass the app (psql, scripts, migrations): run `pgaudit` or triggers alongside this. The central trail must show a change the instant it commits, or in one exact order across services: shipping adds lag, and cross-service order is only as good as the clocks.

01's audit table combined with 09's outbox. Two services (`orders`, `billing`), each with its own database, write audit events into their own `audit_outbox`. A shipper copies them into a central `audit` database.

### Concepts

- **Audit event in the same transaction**: `audit()` in `src/services.ts` inserts into the service's `audit_outbox` using the business transaction's client. The app supplies what the database cannot know: the actor (`bob (support)`, `system:billing`), the reason (`goodwill discount after late delivery`) and the before/after snapshots. A rolled-back change (mallory's) leaves no audit event, and a committed app change cannot be missing its event.
- **The outbox is a temporary local copy**: rows wait with `shipped_at IS NULL` (partial index, as in 09). Once shipped they can be deleted on a retention schedule. The central store is the permanent record, so personal data in its before/after snapshots can only be erased by crypto-shredding (18).
- **Shipper**: `src/shipper.ts` loops per service: claim up to 100 unshipped rows (`FOR UPDATE SKIP LOCKED`), insert them into `audit_events`, mark them shipped, commit, until a claim comes back empty. Send first, mark second: a crash in between means a re-send, never a loss. In production a broker (Kafka) usually sits between the shippers and the store; the guarantees are the same.
- **Dedupe by `event_id`**: `event_id` is the central table's primary key and the insert is `ON CONFLICT (event_id) DO NOTHING`. The re-sent events after the crash are skipped, so the trail has exactly one row per event.
- **Append-only, enforced**: a trigger rejects `UPDATE`, `DELETE` and `TRUNCATE` on `audit_events`. The table owner or a superuser can still disable or bypass it (`ALTER TABLE ... DISABLE TRIGGER`, `session_replication_role = replica`, `DROP TABLE`), so in production the shipper connects with a non-owner role granted `INSERT` only, and the store has its own credentials that no service holds. Hash-chaining rows makes tampering detectable too.
- **The bypass gap**: the trail only contains what app code emits. The run's manual `psql` UPDATE sets the order total to 0 and leaves no trace: the audit trail's last word stays 38.25. Database-level auditing (`pgaudit`, or triggers) catches such writes, with the database role instead of the user; run it alongside, not instead.
- **Order is per entity, not global**: the central row keeps `source_id` (the outbox `id`). For one entity the row lock (`FOR UPDATE` in `changeTotal`) serializes writers, so `source_id` gives that entity's exact order. Across entities it does not: a `BIGSERIAL` is assigned at insert, not at commit. Across services, `occurred_at` (`clock_timestamp()` on each service's clock) is only as good as clock sync. A global timeline is approximate.

### Proof (`logs/17-audit-outbox.log`)

The shipper crashes after storing the orders events and before marking them. Locally they are still unshipped, centrally they are already stored; the next pass re-sends them and the store skips them (abridged):

```
shipper: orders #2 order 1 update by bob (support) -> stored
shipper: CRASH after sending the orders events, before marking them shipped
  1 |
  2 |
 stored_centrally
                2
shipper: orders #1 order 1 create by alice -> DUPLICATE, already in the central log, skipped
shipper: orders #2 order 1 update by bob (support) -> DUPLICATE, already in the central log, skipped
shipper: orders marked 2 shipped
shipper: billing #1 invoice 1 create by system:billing -> stored
```

One timeline across both services, with actors and reasons. There is no row for mallory's rolled-back change (before/after columns cut):

```
 service | source_id | entity  | entity_id | action |     actor      |                reason
 orders  |         1 | order   | 1         | create | alice          | checkout
 orders  |         2 | order   | 1         | update | bob (support)  | goodwill discount after late delivery
 billing |         1 | invoice | 1         | create | system:billing | order total confirmed
```

The store refuses edits, and the psql UPDATE is the gap:

```
ERROR:  audit_events is append-only: UPDATE rejected
ERROR:  audit_events is append-only: DELETE rejected
ERROR:  audit_events is append-only: TRUNCATE rejected

 id | customer | total
  1 | alice    |  0.00

 last_audited_total
 38.25
```


### Origins and further reading

- Article: "Pattern: Audit logging", Chris Richardson, microservices.io. https://microservices.io/patterns/observability/audit-logging.html
- Article: "Pattern: Transactional outbox", Chris Richardson, microservices.io (the transport half; this sample composes the two, it is not a separately named pattern). https://microservices.io/patterns/data/transactional-outbox.html
- Article: "Building Audit Logs with Change Data Capture and Stream Processing", Gunnar Morling, Debezium blog, 2019 (the CDC route, with the actor added through a transaction metadata table). https://debezium.io/blog/2019/10/01/audit-logs-with-change-data-capture-and-stream-processing/
- Tool: pgAudit (statement and session logging to the Postgres log, not before/after rows). https://github.com/pgaudit/pgaudit

---

## 18. Crypto-shredding (`18-crypto-shredding/`)

**Pain: erasure versus immutable data.** GDPR's right to erasure says a customer's personal data must go, but it sits in places you must not or cannot rewrite: an append-only event log (03), an append-only audit store (17), Kafka topics, and every backup taken since.

**Reach for it when** personal data lands in stores that are append-only, replicated or backed up for years, and erasing a person must reach every copy without rewriting any of them.

**Do not reach for it when** the data lives in one mutable table you can `DELETE` from and your backups expire within the erasure deadline: a plain delete is simpler. You need to search, sort or aggregate on the personal fields in the database: ciphertext supports none of that beyond exact-match blind indexes. The identifying part is the metadata (amounts, timestamps, locations): encryption of the named fields does not make the rest anonymous. Your counsel does not accept key deletion as erasure (EU guidance treats encrypted personal data as still personal data): keep the PII in a deletable side store the events point to (forgettable payloads) instead.

Each customer (data subject) gets a random data key (DEK). Personal fields in the append-only `events` table are AES-256-GCM ciphertext under that DEK; event type, order and amount stay in clear. DEKs live in a separate `keys` database, wrapped by a key-encryption key (KEK) from a `kms` database standing in for a KMS. Erasing alice deletes one key row, and every copy of her events, including an old backup, becomes unreadable.

### Concepts

- **Envelope encryption**: data is encrypted with a DEK, and the DEK is stored only encrypted ("wrapped") by a KEK. In production the KEK stays inside a KMS or HSM and you call it to wrap and unwrap; here `kms_keys` hands the KEK to the process, which a real KMS never does. The key store (`subject_keys`) holds `wrapped_dek` and `kek_id`, never a plaintext key.
- **One DEK per subject**: this is what makes erasure selective. Deleting alice's row in `subject_keys` makes her ciphertext undecryptable everywhere: the live table, replicas, Kafka topics, the backup restored into `events_restored`. Bob's key is untouched, so his reads are unchanged. Her rows stay, so history, counts and amounts (49.50 over 3 events) still add up.
- **Why not just delete the rows**: the events table is append-only, enforced by a trigger as in 17, and backups cannot be edited anyway. The run's `DELETE` is rejected.
- **AES-256-GCM with a unique IV**: `seal()` in `src/crypto.ts` draws a random 12-byte IV per call and stores `iv | tag | ciphertext`. Encrypting the same email twice gives two different ciphertexts, so equal values cannot be spotted. Reusing an IV under one GCM key breaks both confidentiality and authentication. Random 96-bit IVs are safe up to about 2^32 encryptions per key, and one key per subject stays far below that.
- **AAD**: each field is sealed with additional authenticated data `subjectId:field`, and each wrapped DEK with `dek:subjectId`. The AAD is not stored in the ciphertext; the reader must supply it, and a mismatch fails authentication. Alice's email pasted into her name field fails, and so does a single flipped bit. Bob's ciphertext in alice's row also fails, mainly because of the per-subject DEK. The subject part of the AAD is defence in depth, and it becomes essential once keys are shared (per tenant, per table).
- **Blind index for lookups**: ciphertext cannot be indexed or compared, so lookup by email goes through `HMAC(blind-index key, trim(lowercase(email)))`. That key is separate from the DEKs, and the index lives in `subject_lookup` in the key store. It cascades on erasure, so after erasure `lookup alice@example.com -> no subject`. Do not put a global-key HMAC in the immutable store: anyone holding that key and the email could still find the erased person's rows. Blind indexes only support exact match, and they leak equality: two rows with the same hash have the same email.
- **KEK rotation**: `npm run rotate` adds KEK 2, unwraps each DEK with its old KEK, rewraps it under the new one, and updates only `subject_keys`. The events' PII fingerprint (md5 over every ciphertext) is identical before and after: not one event was re-encrypted. Once every DEK is rewrapped, the old KEK can be destroyed, which also makes key-store backups wrapped under it useless.
- **The key store's backups undo erasure**: restoring the pre-erasure `keys` dump brings alice back in full (the cautionary step of the run). The key store needs its own backup policy: short retention within the erasure deadline, or an erasure log replayed after every restore. The same holds for its WAL archives and replicas. The flip side: the key store is now the one database whose loss makes every subject's data unreadable, and every read of PII depends on it, so it needs replicas and backups that are durable yet short-lived. A deleted Postgres row also stays in the heap until `VACUUM` reclaims it.
- **Derived plaintext copies**: anything that decrypted the data and kept it (projections, caches, search indexes, analytics exports, application logs) is outside the shredding. This run's own log still shows "Alice Martin", printed before the erasure. Such copies must hold only ciphertext or ids, or be rebuilt from the events after an erasure.
- **What it does not cover**: data already exported or sent to third parties, and metadata left in clear. Alice's amounts, order ids and timestamps are still in the log, and together they can identify a person. Encrypted personal data may also still count as personal data legally (see Verraes below), so check with counsel.

### Proof (`logs/18-crypto-shredding.log`)

The events table holds ciphertext for PII and clear values for the rest; the key store holds wrapped DEKs and HMACs (abridged):

```
 id | subject  |        type        |                data                 |                           pii
  1 | ac3c12a0 | CustomerRegistered | {}                                  | {"name": "TrZkzifAMuS8a8VDWpwLNLchdz3Gbi0WpjnXU1t7rPRgDW
  3 | ac3c12a0 | OrderPlaced        | {"order": "A-1", "amount": "42.50"} | {"ship_to": "r9Yd10wUCkHOHSxo017vhsouoDS5QHsOFYrAaQgAKuo

 subject  |       wrapped_dek        | kek_id
 ac3c12a0 | YoLHwmhQYNGd/Rzt0WTHMQTj |      1
 389b4036 | dZ7xvu8547Tg0I4ydIeT70Qr |      1
```

A fresh IV every time, and AAD rejects moved or edited ciphertext:

```
   seal("alice@example.com") #1 = X5vOeziT8vOcj+7rJDD4WwLVVbnvIEV1...
   seal("alice@example.com") #2 = 2PWzM9YB+0ALWwanZuJB7sVr4f31ei+Q...
   alice's email, read as alice's email: ok, "alice@example.com"
   alice's email ciphertext, pasted into her name field: rejected, Unsupported state or unable to authenticate data
   bob's email ciphertext, pasted into alice's email (wrong DEK and wrong AAD): rejected, Unsupported state or unable to authenticate data
   alice's email with one bit flipped: rejected, Unsupported state or unable to authenticate data
```

KEK rotation rewraps the DEKs; the events are byte for byte the same:

```
 events |         pii_fingerprint
      5 | e03c50d380239956d689c5561ab3a3ee
rotate: new KEK 2 in the kms, 2 DEKs unwrapped and rewrapped under it; not one event re-encrypted
 subject  |       wrapped_dek        | kek_id
 ac3c12a0 | dhwoDgMox5CnrMr4tiWgRtT4 |      2
 389b4036 | z/UPAS0KzQ50yCW6hqVtlwCU |      2
 events |         pii_fingerprint
      5 | e03c50d380239956d689c5561ab3a3ee
```

The nightly events backup holds no plaintext PII, but the amounts are in it:

```
lines matching Alice|alice@|Lilas: 0
lines matching 42.50: 1
```

Alice is erased. Her rows cannot be deleted, they are still there, and her PII is gone; bob is untouched:

```
erase: alice@example.com -> subject ac3c12a0-5fa5-4098-a1c5-97a8123a4375, DEK deleted from the key store (its blind-index row cascades)
ERROR:  events is append-only: DELETE rejected
read: lookup alice@example.com -> no subject
   #1 ac3c12a0 CustomerRegistered                          | name=<erased> email=<erased>
   #2 389b4036 CustomerRegistered                          | name=Bob Keller email=bob@example.com
   #3 ac3c12a0 OrderPlaced        order=A-1 amount=42.50   | ship_to=<erased>
   #4 389b4036 OrderPlaced        order=B-1 amount=19.90   | ship_to=3 Hauptstrasse, Bern
   #5 ac3c12a0 OrderPlaced        order=A-2 amount=7.00    | ship_to=<erased>
 subject  | events | total_amount
 389b4036 |      2 |        19.90
 ac3c12a0 |      3 |        49.50
```

The pre-erasure backup, restored into `events_restored`, is just as unreadable for alice. Restoring the key store's backup too brings her back:

```
read: events from database events_restored, keys from database keys
   #1 ac3c12a0 CustomerRegistered                          | name=<erased> email=<erased>
...
read: events from database events_restored, keys from database keys_restored
read: lookup alice@example.com -> ac3c12a0-5fa5-4098-a1c5-97a8123a4375
   #1 ac3c12a0 CustomerRegistered                          | name=Alice Martin email=alice@example.com
   #3 ac3c12a0 OrderPlaced        order=A-1 amount=42.50   | ship_to=12 rue des Lilas, Lyon
```

### Origins and further reading

- Regulation: GDPR Article 17, "Right to erasure ('right to be forgotten')". https://gdpr-info.eu/art-17-gdpr/
- Article: "Eventsourcing Patterns: Crypto-Shredding", Mathias Verraes, 2019 (includes the legal caveat that encrypted personal data is still personal data). https://verraes.net/2019/05/eventsourcing-patterns-throw-away-the-key/
- Article: "Eventsourcing Patterns: Forgettable Payloads", Mathias Verraes, 2019 (the alternative: PII in a deletable side store). https://verraes.net/2019/05/eventsourcing-patterns-forgettable-payloads/
- Article: "How to deal with privacy and GDPR in Event-Driven systems", Oskar Dudycz, 2023 (crypto-shredding next to retention, compaction and forgettable payloads). https://event-driven.io/en/gdpr_in_event_driven_architecture/
- Docs: "AWS KMS cryptography essentials", section "Envelope encryption", AWS. https://docs.aws.amazon.com/kms/latest/developerguide/kms-cryptography.html#enveloping
- Article: "Building Searchable Encrypted Databases with PHP and SQL", Scott Arciszewski, Paragon Initiative, 2017 (blind indexes, with a key distinct from the encryption key). https://paragonie.com/blog/2017/05/building-searchable-encrypted-databases-with-php-and-sql
- Standard: NIST SP 800-38D, "Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM) and GMAC", Morris Dworkin, 2007 (IV uniqueness, AAD). https://csrc.nist.gov/pubs/sp/800/38/d/final

---

## 19. Leader election (`19-leader-election/`)

**Pain: a job that fires N times, or a single point of failure.** Run three replicas of a cron-like scheduler and each one fires: three emails, three charges, three reports. Run one and it is a single point of failure. Work that must stay in order, like 09's relay, cannot simply be shared out either.

**Reach for it when** exactly one instance among several should do a piece of work at a time (a cron-like scheduler, a relay that must keep per-aggregate order, a partition owner), and you already run Postgres or a coordination service.

**Do not reach for it when** the work can be split instead: let every replica claim its own rows (09's relay with `FOR UPDATE SKIP LOCKED` when order does not matter, 08's waker with a conditional `UPDATE`), which scales and needs no leader. Two instances briefly overlapping would corrupt something that cannot check a fencing token: fix the storage side first, since no lease alone guarantees one leader. Consensus itself (replicated state, not just who leads) is the need: use etcd, ZooKeeper or Consul, never a hand-rolled protocol. Each run can claim itself: insert a `(job, scheduled_slot)` row under a unique key and let the replicas that lose the insert skip, so overlap is harmless and no leader is needed. A few seconds of outage are acceptable: one replica under a supervisor that restarts it costs about what a lease failover (the TTL) costs, with nothing to elect.

Three real OS processes compete for one row in a `leases` table. The holder runs the job; the run script kills it, pauses it and stops it, and a follower takes over each time. Every acquisition bumps a term that the protected table checks as a fencing token. Last, the session-based alternative: `pg_try_advisory_lock`.

### Concepts

- **The lease row**: `leases (name, holder, term, renewed_at, expires_at)`. Every second each replica runs one statement (`src/replica.ts`): `INSERT ... ON CONFLICT (name) DO UPDATE ... WHERE l.holder = EXCLUDED.holder OR l.expires_at <= now()`. It extends my own lease, takes an expired one, or returns no row, which means I am a follower. The conflicting row is locked and the `WHERE` is re-checked against its latest version, so two followers racing for an expired lease cannot both win. `expires_at = now() + TTL` uses the database clock, so replica clocks never get compared with each other. TTL 3s, renew every 1s.
- **Failover costs the TTL**: a `kill -9`ed leader cannot hand anything over. Followers wait for `expires_at` to pass, so the job stops for up to TTL + one renew interval (3.0s in the run, because the followers poll in step with the leader). That is the trade-off to tune. A short TTL means fast failover but more false failovers: a GC pause, a slow disk or a busy database longer than the TTL deposes a healthy leader. A long TTL means fewer false failovers but a longer outage when the leader really dies. Renew several times per TTL (client-go's defaults: 15s lease, 10s renew deadline, 2s retry), so one lost heartbeat is not a failover.
- **Terms**: every acquisition, even by the previous holder after its lease expired, runs `term = term + 1`; a renewal keeps it. The term is a monotonic leadership number, like Raft's term or Chubby's sequencer.
- **Self-fencing**: a leader that cannot confirm a renew must stop before the lease could have expired, without waiting to be told. Before each job run, the replica compares a monotonic clock (`performance.now()`) against the moment it *sent* its last successful renew. Measuring from the send time is conservative, because the server stamped `expires_at` later. Past the TTL, it skips the job. This relies on bounded clock drift: rates, not absolute times. The leader's second must not run much longer than the database's, so real systems stop a margin before the TTL (client-go: `RenewDeadline` < `LeaseDuration`).
- **Fencing tokens** (Kleppmann): self-fencing cannot close the gap between "my check passed" and "my write arrived". A GC pause, a swap-in or a delayed packet in that gap delivers a write from a leader that is no longer one. The fix belongs in the storage. It remembers the highest term it has seen (`fence.max_term`) and rejects anything older: `check_fencing_token`, a `BEFORE INSERT` trigger that locks the fence row, raises `stale fencing token` if `NEW.term < max_term`, and otherwise stores the new maximum. `ticks` has no such check and takes the stale write; `fenced_ticks` rejects it. Every resource the leader touches (a table, an object store, an API) must check the token, or it is not protected.
- **Graceful release**: on `SIGTERM` the leader sets `expires_at = now()` (only if it still holds that term) before exiting. A planned deploy then costs one renew interval, not a TTL. Kubernetes controllers do the same (`ReleaseOnCancel`).
- **Session lock, `pg_try_advisory_lock`**: no table, no TTL, no heartbeat. The lock lives exactly as long as the database session that took it. A killed process loses it at once, because the kernel closes its socket. A paused process keeps it indefinitely, because its session is alive, so there is no failover at all. A client that vanished without closing its connection (host crash, cable pulled, a NAT that dropped the flow) is a half-open connection. The server keeps its session, and the lock, until TCP keepalive gives up. By default that is the OS setting: 7200s idle + 9 probes x 75s on Linux, over two hours. Set `tcp_keepalives_idle` / `_interval` / `_count`, `tcp_user_timeout` or `idle_session_timeout` to shorten it. The lock also does not fence. When the session dies, a new holder can take the lock while the old process still believes it leads, and writes it sends over other connections carry no term. Writes over the locking connection itself fail once that session is gone. Pair the lock with a counter bumped on acquisition if the protected resource must reject stale writes.
- **Pooler trap**: a transaction-mode pooler (PgBouncer `pool_mode = transaction`) gives each transaction whichever server connection is free. A session lock taken in one transaction stays on that server connection, the unlock lands on another (`you don't own a lock of type ExclusiveLock`), and the lock stays held by an idle pooled connection that no code owns. PgBouncer lists session-level advisory locks as unsupported in transaction mode. `pg_try_advisory_xact_lock` does work there, but it ends with the transaction, so it guards one job run, not a leadership term. Take the session lock on a dedicated direct connection, or use the lease row.
- **Why not roll your own consensus**: this sample borrows a linearizable store (one Postgres primary) and builds a lease on it. Electing a leader among peers without such a store needs a consensus protocol (Paxos, Raft, Zab). Those are notoriously hard to get right: quorum, persistence, membership changes, and the failure cases Jepsen keeps finding. If Postgres is the dependency anyway, a lease row in it is fine. The database is then the single point of failure, and a failover to a lagging replica can reset terms unless replication is synchronous. With a dedicated coordination service, use its recipes. etcd has a lease with keepalive plus `concurrency.Election`, and the revision serves as a fencing token. ZooKeeper has ephemeral sequential znodes, and the zxid or znode version serves as a token. Consul has sessions and `lock`. On Kubernetes, use a `coordination.k8s.io/v1` Lease object with client-go's `leaderelection`, whose docs state it tolerates clock skew but not skew rate, and does not guarantee a single acting leader (no fencing).

### Proof (`logs/19-leader-election.log`)

Without election, all three replicas run the job every second:

```
  second  | runs |   by
 06:26:19 |    3 | a, b, c
 06:26:20 |    3 | a, b, c
 06:26:21 |    3 | a, b, c
 06:26:22 |    3 | a, b, c
```

With the lease, one leader; the row's times come from the database clock:

```
   06:26:23 [c] acquired the lease, term 1
   06:26:23 [a] follower, c leads (term 1)
   06:26:23 [c] job ran, term 1
   06:26:23 [b] follower, c leads (term 1)
 scheduler | c      |    1 | 06:26:26.5 | 06:26:29.5 |          2.5
```

`kill -9` the leader: nobody runs the job until its lease expires, then a follower takes term 2:

```
   06:26:27 kill -9 c (pid 58995)
   06:26:29 [a] acquired the lease, term 2; c's lease had expired 0.0s ago
   06:26:29 [b] follower, a leads (term 2)
```

The leader freezes right after a renew. On resume its own check stops it before any write, and its next renew is refused:

```
   06:26:32 [a] renewed term 2, before the job's lease check: SIGSTOP now (a GC pause stand-in)
   06:26:35 [b] acquired the lease, term 3; a's lease had expired 0.0s ago
   06:26:37 kill -CONT a, after b took over
   06:26:37 [a] SIGCONT: resumed
   06:26:37 [a] self-fenced: last renew was sent 4.9s ago, past the 3s TTL, so the lease may be someone else's; job skipped
   06:26:38 [a] renew refused: b holds term 3; stepping down
```

The leader freezes after its check passed. On resume it writes with term 3 while term 4 leads: the unfenced table takes it, the fenced one rejects it:

```
   06:26:40 [b] lease check passed for term 3, before the write: SIGSTOP now (a GC pause stand-in)
   06:26:44 [a] acquired the lease, term 4; b's lease had expired 0.9s ago
   06:26:46 [b] SIGCONT: resumed
   06:26:46 [b] job ran, term 3: ticks accepted it, fenced_ticks REJECTED it (stale fencing token: term 3 < term 4 already seen)
   06:26:47 [b] renew refused: a holds term 4; stepping down
```

The same window in both tables, `ticks` first, then `fenced_ticks`. `ticks` shows two leaders writing (row 27); in `fenced_ticks` the rejected insert only burned id 15 (abridged):

```
 id | holder | term |     at
 24 | b      |    3 | 06:26:39.6
 25 | a      |    4 | 06:26:44.5
 26 | a      |    4 | 06:26:45.5
 27 | b      |    3 | 06:26:46.3
 28 | a      |    4 | 06:26:46.5

 id | holder | term |     at
 12 | b      |    3 | 06:26:39.6
 13 | a      |    4 | 06:26:44.5
 14 | a      |    4 | 06:26:45.5
 16 | a      |    4 | 06:26:46.5
```

Every change of writer in `ticks`, with the time since the previous job run: 3.0s after the kill, 4.0s and 4.9s across the pauses, 0.9s for the graceful release (rows 27 and 28 are b's stale write in between):

```
 id | holder | term |     at     | gap_s
 13 | c      |    1 | 06:26:23.5 |
 17 | a      |    2 | 06:26:29.5 |   3.0
 20 | b      |    3 | 06:26:35.5 |   4.0
 25 | a      |    4 | 06:26:44.5 |   4.9
 27 | b      |    3 | 06:26:46.3 |   0.9
 28 | a      |    4 | 06:26:46.5 |   0.2
 31 | b      |    5 | 06:26:49.4 |   0.9

   06:26:49 [a] SIGTERM: released the lease (term 4) so a follower need not wait for the TTL; exiting
   06:26:49 [b] acquired the lease, term 5; a's lease had expired 0.3s ago
```

The session lock: a paused holder keeps it, a killed one loses it at once; the defaults leave a vanished client's session to the OS keepalive:

```
   06:26:53 [taker] pg_try_advisory_lock(18) still false after 0.0s: another session holds it
   06:26:53 kill -STOP the holder (pid 60691)
   06:26:57 [taker] pg_try_advisory_lock(18) still false after 4.1s: another session holds it
   06:26:57 kill -CONT, then kill -9 the holder
   06:26:57 [taker] pg_try_advisory_lock(18) = true on backend 415 after 0.0s

 idle_session_timeout    | 0       | ms
 tcp_keepalives_count    | 0       |
 tcp_keepalives_idle     | 0       | s
 tcp_keepalives_interval | 0       | s
 tcp_user_timeout        | 0       | ms
tcp_keepalive_time:7200
tcp_keepalive_intvl:75
tcp_keepalive_probes:9
```

Behind a pool, the unlock lands on the wrong connection:

```
   06:26:57 [pooler] transaction 1 runs on backend 430: pg_try_advisory_lock(18) = true
   06:26:57 [pooler] server says: you don't own a lock of type ExclusiveLock
   06:26:57 [pooler] transaction 2 runs on backend 431: pg_advisory_unlock(18) = false
   06:26:57 [pooler] the lock is still held by backend 430, an idle pooled connection; it stays held until that connection closes
   06:26:57 [pooler] pg_try_advisory_xact_lock(18) = true inside a transaction on backend 431; backend 430 meanwhile gets false
```

### Origins and further reading

- Paper: "Leases: An Efficient Fault-Tolerant Mechanism for Distributed File Cache Consistency", Cary G. Gray and David R. Cheriton, SOSP 1989 (where leases come from, including the clock-drift assumption). https://dl.acm.org/doi/10.1145/74851.74870
- Paper: "The Chubby lock service for loosely-coupled distributed systems", Mike Burrows, OSDI 2006 (coarse-grained locks, sequencers, lock-delay). https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/
- Article: "How to do distributed locking", Martin Kleppmann, 2016 (fencing tokens, why a lock with a timeout alone is unsafe). https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
- Docs: "Leases", Kubernetes (Lease objects for leader election of control-plane components and your own controllers). https://kubernetes.io/docs/concepts/architecture/leases/
- Docs: client-go `leaderelection` package (LeaseDuration, RenewDeadline, RetryPeriod; tolerant to clock skew, not skew rate; no fencing guarantee). https://pkg.go.dev/k8s.io/client-go/tools/leaderelection
- Docs: "Advisory Locks", PostgreSQL 16 (session-level vs transaction-level). https://www.postgresql.org/docs/16/explicit-locking.html
- Docs: PgBouncer features (session-level advisory locks are not supported in transaction pooling). https://www.pgbouncer.org/features.html

---

## 20. Full-stack member portal (`20-portal/`)

**Pain: a portal whose pages need JavaScript, an API layer and trust in the client.** A form that only works through a client-side `fetch` does nothing for anyone whose script failed to load. Validation that runs only in the browser is skipped by anyone who posts directly. A query that takes the member id from the URL or a hidden field shows one member another member's data.

**Reach for it when** you build a server-rendered React app that reads its own database: a member, customer or staff portal where most pages are "read my data" and a few forms change it, and where the pages must work for everyone, with or without JavaScript.

**Do not reach for it when** the UI is a long-lived client application (a dashboard that keeps state across hundreds of interactions, offline use), or the data belongs to other services you must call through their APIs anyway. A few static pages need no framework at all: 21 renders React on a bare `node:http` server.

A Next.js 16 App Router app on Postgres: profile, contributions, a change-of-address form and the page of one change request. The demo builds it, starts `next start` as a separate process, and drives it with a client that has JavaScript turned off: plain GETs, form POSTs built from the HTML it received, and a cookie jar. Members `alice` (Acme), `bob` (Globex) and `carol` (Initech) sign in with their username alone, because the session is a stub.

### Concepts

- **Server component**: an `async` React component that runs only on the server. `ProfilePage` calls `requireMember()`, awaits a SQL query and returns JSX; React renders the rows into the HTML response. No API endpoint, no client-side fetch, no loading state, and no database code is sent to the browser.
- **Dynamic rendering**: a page that reads `cookies()` cannot be built ahead of time, so `next build` marks it `ƒ` and renders it per request. `/` only redirects, so it is prerendered (`○`).
- **Server action**: a function marked `"use server"` that a `<form action={fn}>` calls. Next gives it an id and renders the form as an ordinary `POST` form with hidden `$ACTION_*` fields, so the browser can submit it with no JavaScript at all. When JS is present, React submits it with `fetch` instead and updates the page in place.
- **Progressive enhancement**: the page works as plain HTML first and JavaScript improves it. The change-of-address form is a client component using `useActionState`; without JS the browser posts it, Next runs the action, and renders the page again with the state the action returned (field errors, the values typed). The demo's client proves it: it never runs a script.
- **Server-side validation**: the action validates with a zod schema (`src/lib/address.ts`) whatever the client did. `z.flattenError` turns the issues into `{ field: [messages] }`, rendered next to each field with `aria-invalid` and `aria-describedby` (21 explains why). The schema also normalises: `ab1 2cd` is stored as `AB1 2CD`. "Not in the past" compares with today's date in UTC (`src/lib/address.ts`); a portal used across time zones would compare in one configured service time zone instead.
- **Post/Redirect/Get**: a successful action calls `redirect()`, which answers `303 See Other` to the new request's page. The browser follows with a GET, so a reload or Back does not post the form again. An invalid submission answers `200` with the form, because there is nothing to redirect to.
- **Session cookie stub**: the cookie holds `memberId.signature`, an HMAC-SHA256 of the id with a server secret, `HttpOnly` (scripts cannot read it) and `SameSite=Lax` (not sent on cross-site POSTs). A changed id without the matching signature is no session. A real portal gets the member from its identity provider (26); everything after `requireMember()` stays the same.
- **Data access scoped to the member**: every function in `src/lib/members.ts` takes the member id from the session and filters on it, including the lookup by request id (`WHERE id = $1 AND member_id = $2`). So bob asking for alice's request gets 404, not 403: the row does not exist for him, and the answer does not reveal that the id exists. The action never reads a member id from the form, so a forged `member_id` field changes nothing. This closes the insecure direct object reference (IDOR) hole.
- **The database holds the rule**: "at most one pending address change per member" is a partial unique index `(member_id, kind) WHERE status = 'pending'`. Two concurrent submissions cannot both pass, which a `SELECT` before the `INSERT` cannot guarantee. The action turns the `23505` unique violation into a form-level error.
- **CSRF protection for actions**: Next compares the `Origin` header of an action request with the host, and aborts a mismatch before the action runs. Together with `SameSite=Lax`, a form on another site cannot submit actions with the member's cookie.
- **Trade-offs**: action ids change with every build, so a page rendered by the old version and submitted after a deploy can post an id the new server does not know, and gets an error; plan deploys with that in mind. Next decides much for you (routing by folder, caching rules, what runs where), and its conventions change between major versions. A rejected cross-origin action answers 500 rather than 403. The session is a stub with no expiry, rotation or logout.

### Proof (`logs/20-portal.log`)

`next build` renders the pages that read the session per request:

```
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /address
├ ƒ /contributions
├ ƒ /login
├ ƒ /profile
└ ƒ /requests/[id]
```

Signing in with JS off: the form carries a hidden action id, the action sets the cookie and redirects:

```
   POST /login username=alice (no JS)           -> 303 Location: /profile Set-Cookie: sid=1.DyFq...; Path=/; HttpOnly; SameSite=lax
   hidden fields the server rendered into the form: $ACTION_ID_<id>
```

An invalid change, posted without JS, comes back with the zod errors rendered by the server and the typed value kept; nothing is written:

```
   hidden fields: $ACTION_REF_1, $ACTION_1:0, $ACTION_1:1, $ACTION_KEY
   POST /address (blank line 1, bad postcode, past date) -> 200
     line1: Error: Enter the first line of the address
     postcode: Error: Enter a real postcode, like AB1 2CD
     effectiveFrom: Error: The date cannot be in the past
     aria-invalid on: line1, postcode, effectiveFrom; city kept as typed: true
```

A valid one redirects to the new request (Post/Redirect/Get); the forged `member_id=2` is ignored:

```
   POST /address (valid, plus member_id=2)      -> 303 Location: /requests/1
   GET /requests/1 -> 200: Address change request 1 | Status: Pending | New address: 1 High Street, Springfield, AB1 2CD, from 2026-10-09. Requested 2026-10-02 17:10. |
```

Scoping: bob cannot see alice's request (nor an id too large for the column), a cookie with a borrowed signature is no session, and Next refuses an action posted from another origin, here for carol, who has no pending request, so a write would have shown:

```
   GET /requests/1 as bob                       -> 404
   GET /requests/99999999999 as bob             -> 404
   GET /profile with sid=2.<alice's signature>  -> 307 Location: /login
`x-forwarded-host` header with value `localhost:53030` does not match `origin` header with value `attacker.example` from a forwarded Server Actions request. Aborting the action.
   POST /address as carol, Origin: http://attacker.example -> 500
   Next aborted the action before it ran (its log line above); change_requests rows: 1
```

One row survives four address submissions (invalid, valid, duplicate, cross-origin), owned by alice, postcode normalised:

```
 id | member_id |  kind   |                                 payload                                  | effective_from | status
----+-----------+---------+--------------------------------------------------------------------------+----------------+---------
  1 |         1 | address | {"city": "Springfield", "line1": "1 High Street", "postcode": "AB1 2CD"} | 2026-10-09     | pending
```

### Origins and further reading

- Docs: "Server and Client Components", Next.js. https://nextjs.org/docs/app/getting-started/server-and-client-components
- Docs: "Forms" (server actions, `useActionState`, validation, progressive enhancement), Next.js. https://nextjs.org/docs/app/guides/forms
- Docs: "Data Security" (data access layer, action security, `Origin` checks), Next.js. https://nextjs.org/docs/app/guides/data-security
- Docs: `useActionState`, React. https://react.dev/reference/react/useActionState
- Article: "Understanding Progressive Enhancement", Aaron Gustafson, A List Apart, 2008. https://alistapart.com/article/understandingprogressiveenhancement/
- Article: "Redirect After Post", Michael Jouravlev, TheServerSide, 2004 (Post/Redirect/Get). https://www.theserverside.com/news/1365146/Redirect-After-Post
- Docs: OWASP "Insecure Direct Object Reference Prevention Cheat Sheet". https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html
- Docs: OWASP "Cross-Site Request Forgery Prevention Cheat Sheet" (origin checks, SameSite). https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- Docs: Zod. https://zod.dev

---

## 21. Accessible forms, WCAG 2.2 AA and RGAA (`21-accessibility/`)

**Pain: a form that some members cannot use at all.** A placeholder that disappears once you type, a "button" the keyboard never reaches, an error shown only as a red border, focus left at the top of the page after a failed submit. Nobody on the team notices, because they all use a mouse and see colour, and the members who cannot complete the form call the help desk or give up.

**Reach for it when** you build forms for the public or for members, which in many countries must meet WCAG 2.1 or 2.2 level AA by law (RGAA in France, EN 301 549 in the EU, Section 508 in the US, which references WCAG 2.0 AA). Put an automated scan and a keyboard journey in the test suite so regressions fail the build.

**Do not reach for it when** you expect it to replace an audit. Automated rules find a minority of failures; testing with screen readers and real users, and a conformance audit against WCAG-EM or the RGAA checklist, are still needed before you claim conformance.

The same "change of address" form in two versions, rendered with `react-dom/server` on a tiny `node:http` server. The demo drives both in Chromium through Playwright: an axe-core scan of each page state, a keyboard-only journey, and what Chromium's accessibility tree hands a screen reader for each field, read through the Chrome DevTools Protocol.

### Concepts

- **WCAG 2.2 and RGAA**: WCAG (W3C) states testable success criteria grouped under four principles (perceivable, operable, understandable, robust), at levels A, AA and AAA; AA is what laws and contracts ask for. RGAA 4.1, the French public-sector standard, turns WCAG 2.1 AA into 106 criteria with test procedures; the demo prints the closest RGAA criterion next to each finding. WCAG 2.2 adds criteria RGAA 4.1 does not have yet, such as 2.5.8 target size.
- **Automated scan (axe-core)**: axe runs inside the real page and reports each failed rule with its WCAG tags (`wcag143` is success criterion 1.4.3). It found the missing `lang` (3.1.1), the low-contrast grey text (1.4.3) and the unlabelled radios (4.1.2). Scan every state a user can reach: the form after a failed submit is a different page. While this sample was being written, the scan of the accessible form's error state failed 2.5.8 (the error summary links were 17 px tall); padding fixed it.
- **What axe cannot see**: axe's `label` rule accepts a non-empty `placeholder` as a label (its `non-empty-placeholder` check; Chromium also uses the placeholder as the accessible name), so the placeholder-only inputs pass, although the placeholder disappears as soon as you type. An error shown only as a red border is invisible to axe and to a screen reader: the accessibility tree shows no description and `invalid=false` (1.4.1 use of colour, 3.3.1 error identification). A `div` with a click handler is no failure to axe here; the keyboard journey shows it can never be reached.
- **Accessible name and description**: what a screen reader announces for a field. The name comes from the `<label for>`; the description joins, in order, the elements listed in `aria-describedby` (the hint "For example, AB1 2CD", then the error); `aria-invalid="true"` adds "invalid entry". The visually hidden `Error:` prefix makes the message an error for listeners too, not just red text.
- **Keyboard operability**: Tab must reach every control in reading order (2.1.1, 2.4.3). A radio group is one tab stop; arrows move inside it, Space selects. A real `<button>` is focusable and submits on Enter; a form with several text inputs and no submit button cannot be submitted by Enter at all (HTML implicit submission).
- **Error summary with focus**: after a failed submit the page starts with a box titled "There is a problem", listing each error as a link to its field, and the page moves focus to it (`tabindex="-1"` plus one line of script; `role="alert"` also announces it). Following a link focuses the field. The page `<title>` starts with `Error:` so the first thing announced on reload says what happened. This is the GOV.UK Design System pattern.
- **Grouping and autocomplete**: `fieldset` and `legend` name a group of fields (the address, the radios' question) so each radio is announced with its question (1.3.1). `autocomplete="address-line1"`, `postal-code`, ... let browsers and assistive tools fill and identify fields (1.3.5).
- **Trade-offs**: the scripted checks prove only what they assert: no tool judges whether an error message is helpful, whether reading order makes sense, or how the form behaves at 400% zoom or with a screen reader's virtual cursor. The accessibility tree read here is Chromium's; other browsers and screen readers differ. Keep the scan in CI (30 runs axe as a pipeline gate; this sample's demo shows the in-browser scan, which also covers contrast and focus) and schedule manual audits.

### Proof (`logs/21-accessibility.log`)

axe finds three rule failures on the inaccessible form, and none on the accessible one, in either state:

```
   axe /bad -> 3 violations, 7 rules passed, 0 need review (out/axe-bad-errors.json)
     color-contrast   serious   WCAG 1.4.3        RGAA 3.2    3 nodes  Elements must meet minimum color contrast ratio thresholds
     html-has-lang    serious   WCAG 3.1.1        RGAA 8.3    1 nodes  <html> element must have a lang attribute
     label            critical  WCAG 4.1.2        RGAA 11.1   2 nodes  Form elements must have labels
...
   axe /good -> 0 violations, 17 rules passed, 0 need review (out/axe-good-empty.json)
   axe /good -> 0 violations, 24 rules passed, 0 need review (out/axe-good-errors.json)
```

What a screen reader gets after the failed submit of each form. The inaccessible one has names (from the placeholders) but nothing says there is an error; the accessible one ties hint and error to the field:

```
   input[name=postcode] role=textbox    name="Postcode"                 description=""                                                         invalid=false
   4 inputs have the red .err border; focus after the reload is on: body
...
   #error-summary       role=alert      name="There is a problem"       description=""                                                         invalid=false
   #postcode            role=textbox    name="Postcode"                 description="For example, AB1 2CD Error: Enter a real postcode, like AB1 2CD" invalid=true
```

Keyboard only: Tab never reaches the inaccessible form's Save, and Enter does nothing. On the accessible form, focus goes to the error summary, its link to the field, and the form completes:

```
   Tab  5 -> radio
   Enter in the postcode field: 0 POST requests, still on /bad
...
   Tab  6 -> button "Save new address"
   focus on button "Save new address", press Enter
   -> 422, focus is now on #error-summary: alert "There is a problem"
   Tab -> link "Enter the first line of your address"
   Enter -> focus on #line1: textbox "Address line 1"
...
   typed the address, Space on "From today", Tab -> button "Save new address", Enter
   -> /good/done: "Address saved"
```

The findings, and how each was found:

```
   html-has-lang              WCAG 3.1.1         RGAA 8.3        found by axe
   color-contrast             WCAG 1.4.3         RGAA 3.2        found by axe
   label                      WCAG 4.1.2         RGAA 11.1       found by axe (radios only; placeholders pass)
   colour-only error          WCAG 1.4.1         RGAA 3.1        found by accessibility tree
   error not announced        WCAG 3.3.1, 4.1.2  RGAA 11.10      found by accessibility tree
   no error summary or focus  WCAG 3.3.1, 2.4.3  RGAA 11.10      found by keyboard journey
   div as button              WCAG 2.1.1, 4.1.2  RGAA 7.3        found by keyboard journey
   radios not grouped         WCAG 1.3.1         RGAA 11.5, 11.6 found by markup query
   no autocomplete tokens     WCAG 1.3.5         RGAA 11.13      found by markup query
```

### Origins and further reading

- Standard: "Web Content Accessibility Guidelines (WCAG) 2.2", W3C Recommendation, 2023. https://www.w3.org/TR/WCAG22/
- Docs: "Understanding WCAG 2.2" (the intent and techniques behind each criterion), W3C WAI. https://www.w3.org/WAI/WCAG22/Understanding/
- Standard: RGAA 4.1, "Critères et tests", DINUM. https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/
- Standard: "Website Accessibility Conformance Evaluation Methodology (WCAG-EM) 1.0", W3C, 2014. https://www.w3.org/TR/WCAG-EM/
- Standard: "Accessible Name and Description Computation 1.2", W3C. https://www.w3.org/TR/accname-1.2/
- Docs: axe-core rule descriptions, Deque. https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md
- Docs: "Accessibility testing", Playwright. https://playwright.dev/docs/accessibility-testing
- Docs: "Error summary" and "Error message" components, GOV.UK Design System. https://design-system.service.gov.uk/components/error-summary/
- Article: "Placeholders in Form Fields Are Harmful", Katie Sherwin, Nielsen Norman Group, 2014. https://www.nngroup.com/articles/form-design-placeholders/
- Article: "What we found when we tested tools on the world's least-accessible webpage", Mehmet Duran, GOV.UK accessibility blog, 2017. https://accessibility.blog.gov.uk/2017/02/24/what-we-found-when-we-tested-tools-on-the-worlds-least-accessible-webpage/

---

## 22. End-to-end tests with Playwright (`22-playwright/`)

**Pain: end-to-end tests nobody trusts.** They pass on a laptop and fail on CI because of a fixed `sleep`. They break when someone renames a CSS class. They pass alone and fail together because one test leaves rows that the next one counts. Every test signs in through the login page, so the suite is slow, and when one fails there is nothing to look at but a stack trace.

**Reach for it when** a few user journeys must keep working release after release (sign in, see my contributions, request a change and see it pending) and you want them checked in a real browser, in parallel, on every change.

**Do not reach for it when** the behaviour is a rule you can call directly: test it with a unit test (here, Vitest), which runs in milliseconds and can cover every edge case. Keep browser tests to one journey per outcome.

A small member portal (`node:http`, server-rendered HTML, Postgres) with two test suites: Vitest for the rule that accepts or refuses a change request, and `@playwright/test` for the journeys. The demo runs the suites six times in different configurations and checks each outcome: green; with the per-test reset turned off; a fixed sleep against a fast and then a slow API; CSS selectors against a markup refactor.

### Concepts

- **Unit tests for the rule, browser tests for the journey**: `checkRequest()` (a real calendar date, none in the past, at most 90 days ahead, one pending change per kind, email format) is a pure function, tested with Vitest at its boundaries (the 90th day passes, the 91st fails; 2026-02-30 is refused, not rolled over to March). Two concurrent submissions can both pass the check, so a partial unique index (`member_id, kind WHERE status = 'pending'`) backs the one-pending-per-kind rule and its violation gets the same message. The browser suite checks only that the journey reaches each outcome once: a request goes through and shows Pending, a duplicate is refused with a message.
- **Role and label locators**: `getByRole("button", { name: "Sign in" })`, `getByLabel("Username")`, `getByRole("table", { name: "Change requests" })` find elements the way a user and a screen reader do (21). They survive restyling and restructuring, and fail when the page really changed for users, for example when a label is lost. CSS paths like `#login-form > div:nth-child(1) > input` encode the DOM structure; the demo's `MARKUP=v2` refactor keeps every label and button text, and only the CSS test breaks.
- **Auto-waiting and web-first assertions**: Playwright actions wait for their element to be attached, visible, stable and enabled; `expect(locator).toHaveText()` retries until the text matches or the timeout passes. `page.waitForTimeout(500)` followed by reading `textContent()` checks once at an arbitrary moment. Whether it passes depends on how fast the server answers. The demo makes that deterministic: the total is loaded by a `fetch` delayed by `API_DELAY_MS`, and the sleep passes at 100 ms and fails at 1500 ms, while the web-first assertion passes at both.
- **Test isolation, a database per worker**: a worker-scoped fixture clones `portal_template` (`CREATE DATABASE ... TEMPLATE`, which copies the template's pages instead of replaying the schema and seed) and starts the app in the worker on a free port, so parallel workers never share rows. Workers are separate processes that live across many tests; the fixture drops the database when the worker ends.
- **Reset without a transaction**: wrapping each test in a transaction that rolls back does not work for browser tests: the app serves the browser's requests on its own connections, which cannot see an uncommitted transaction. An automatic test-scoped fixture truncates the tables tests write instead. Without it (`NO_RESET=1`) the address test counts the email test's leftover row and fails, but only in that order: an order-dependent failure is the signature of a leaking fixture.
- **Login once, `storageState`**: a `setup` project signs in through the real form once and saves the cookies to `.auth/alice.json`; the `chromium` project depends on it and starts every test with that state. The session is a signed cookie any worker's server can verify. Tests about signing in override it with an empty state.
- **Traces on failure**: `trace: "retain-on-failure"` records every action, a DOM snapshot before and after it, network, console and source, and keeps the file only when the test fails. `npx playwright show-trace` replays it; the log lists its actions and shows the total's request had no response yet when the assertion ran.
- **Reports**: the list reporter for the console and a JSON reporter per run, which the demo reads to check which tests failed and on which worker. Playwright replaces a worker after a failure, which is why the leaky run's next test passes on a fresh database.
- **Trade-offs**: one database per worker multiplies setup time and connections; the template must be rebuilt when the schema changes. Truncating is simple but must list every table tests write. The app runs inside the test worker here, so tests can reach its pool; against a deployed environment you seed through an API or a test-only endpoint instead. Retries (`retries: 2`) hide flakes rather than fix them: Playwright reports a test that passes on retry as "flaky", and those reports are worth reading.

### Proof (`logs/22-playwright.log`)

Six tests (setup plus five journeys) on two workers, each worker with its own database and app server; the setup signs in once and the journeys start from the saved state:

```
   [worker 0] database portal_w0, app on http://localhost:41979
  ✓  1 [setup] › e2e/auth.setup.ts:3:1 › sign in once as alice and save the session (1.5s)
   [worker 1] database portal_w1, app on http://localhost:44313
   [worker 2] database portal_w2, app on http://localhost:43769
  ✓  2 [chromium] › e2e/journeys.spec.ts:3:1 › view contributions (1.1s)
  ✓  3 [chromium] › e2e/journeys.spec.ts:13:1 › request an email change and see it pending (2.0s)
  ✓  4 [chromium] › e2e/journeys.spec.ts:26:1 › request an address change and see it pending (1.1s)
...
   storageState .auth/alice.json: cookie sid=1.DyFqWL... httpOnly=true sameSite=Lax; journeys ran on workers 1, 2
```

Without the reset, on one worker, the second writer sees the first one's row; the worker that replaces it starts clean:

```
  ✓  3 [chromium] › e2e/journeys.spec.ts:13:1 › request an email change and see it pending (482ms)
  ✘  4 [chromium] › e2e/journeys.spec.ts:26:1 › request an address change and see it pending (5.3s)
   [worker 2] database portal_w2, app on http://localhost:34135
  ✓  5 [chromium] › e2e/journeys.spec.ts:36:1 › a second pending change of the same kind is refused (691ms)
...
    Error: expect(locator).toHaveCount(expected) failed

    Locator:  getByRole('table', { name: 'Change requests' }).getByRole('row')
    Expected: 2
    Received: 3
```

The fixed sleep fails once the API takes 1500 ms; the web-first assertion waits and passes:

```
  ✘  2 [chromium] › e2e/waiting.spec.ts:4:1 › total after a fixed 500 ms sleep (1.1s)
  ✓  3 [chromium] › e2e/waiting.spec.ts:10:1 › total with a web-first assertion (2.4s)
...
    Expected: "Total: 1,350.00"
    Received: "Loading total..."
```

After the markup refactor, the CSS test cannot find its input; the role and label test still passes:

```
  ✓  2 [chromium] › e2e/locators.spec.ts:13:1 › sign in with role and label locators (825ms)
  ✘  3 [chromium] › e2e/locators.spec.ts:5:1 › sign in with CSS selectors (5.5s)
    TimeoutError: locator.fill: Timeout 5000ms exceeded.
    Call log:
      - waiting for locator('#login-form > div:nth-child(1) > input')
```

A trace was kept for each failure only, and the flaky test's trace shows why it failed:

```
test-results/leaky/journeys-request-an-address-change-and-see-it-pending-chromium/trace.zip
test-results/locators-v2/locators-sign-in-with-CSS-selectors-chromium/trace.zip
test-results/waiting-slow/waiting-total-after-a-fixed-500-ms-sleep-chromium/trace.zip
...
  step: Navigate to "/contributions"
  step: Wait for timeout
  step: Get text content getByRole('status')
  step: Expect "toBe"
...
  GET /contributions -> 200 in 68 ms
  GET /api/contributions/total -> no response yet when the test ended
```

The per-worker databases are gone after the runs; only the template and the hand-run database remain:

```
     datname
-----------------
 portal
 portal_template
 postgres
```

### Origins and further reading

- Docs: "Best Practices", Playwright (user-facing locators, web-first assertions, isolation). https://playwright.dev/docs/best-practices
- Docs: "Auto-waiting" (actionability checks), Playwright. https://playwright.dev/docs/actionability
- Docs: "Authentication" (setup project, `storageState`), Playwright. https://playwright.dev/docs/auth
- Docs: "Fixtures" (worker-scoped and automatic fixtures), Playwright. https://playwright.dev/docs/test-fixtures
- Docs: "Trace viewer", Playwright. https://playwright.dev/docs/trace-viewer
- Docs: "Template Databases", PostgreSQL 16. https://www.postgresql.org/docs/16/manage-ag-templatedbs.html
- Docs: Vitest. https://vitest.dev/guide/
- Article: "Eradicating Non-Determinism in Tests", Martin Fowler, 2011. https://martinfowler.com/articles/nonDeterminism.html
- Article: "The Practical Test Pyramid", Ham Vocke, 2018. https://martinfowler.com/articles/practical-test-pyramid.html
- Article: "Write tests. Not too many. Mostly integration.", Kent C. Dodds, 2017 (and the Testing Library guiding principle behind role queries). https://kentcdodds.com/blog/write-tests

---

## 23. Executable specifications (`23-specs/`)

**Pain: acceptance criteria that nobody runs.** The rules of a change ("above 1,000.00 a month it needs a second approval", "nobody approves their own request", "not in the past") live in a ticket. The code is written from a one-line summary, the tests check what the developer understood, and the gap is found in production or by an auditor. Nobody can say which requirement is tested by what, or whether it passes today.

**Reach for it when** business rules are agreed with people who do not read code (product owners, operations, auditors), the rules have boundaries and exceptions worth writing down as examples, and you must show which requirement is covered and passing.

**Do not reach for it when** nobody outside the team reads the feature files: the Given/When/Then layer then costs a pattern per step and buys nothing over plain tests named after the rule. The behaviour is layout or performance. The rules change daily and the examples would be rewritten more often than run.

`features/change-bank-details.feature` states "request a change of bank details" as five `Rule:` blocks tagged `@REQ-01` to `@REQ-05`, each with concrete scenarios. Cucumber runs them through `src/steps.ts` against an implementation chosen by `IMPL`: `naive` (written from the one-line ticket) or `domain` (written from the rules), both on Postgres. The traceability report is built from Cucumber's own message stream and stored in Postgres.

### Concepts

- **Specification by example**: each rule is pinned by examples at its boundaries (999.99, 1000.00, 1000.01; yesterday, today, tomorrow). The examples are what the business agrees to and what the code is checked against; they replace "the threshold is 1,000" with what happens at 1,000.00 exactly.
- **Gherkin `Rule`**: Gherkin 6 added `Rule:` between `Feature` and `Scenario`, one per business rule. A tag on the rule (`@REQ-02`) is inherited by every scenario and every outline example under it, so a requirement id is written once.
- **Scenario outline**: one scenario, one row per example. Each row runs as its own test case (a pickle), so a failure names the row, here `[1000.01, awaiting second approval]`.
- **Step definitions**: Cucumber expressions (`{string}`, `{float}`, `{word}`) map each sentence to code that drives the domain. The World holds per-scenario state: a fixed "today" (the clock is a step, not `new Date()`), the last request, the last refusal. `Before` truncates the tables, so scenarios do not share data and can run in any order.
- **Same specs, two implementations**: the feature file does not change between the runs; only `IMPL` does. The naive code fails 6 of 13 scenarios for three reasons a reviewer could easily miss: one approval always applies the change, nothing stops self-approval (neither by whoever entered the request nor by the member whose account it changes, when staff entered it for them), and the effective date is compared as a timestamp (`new Date("2026-03-10") < now` at 09:30), so today counts as the past.
- **Traceability matrix**: `--format message` writes Cucumber messages (ndjson): the parsed feature, pickles with their tags and AST node ids, test cases, and every step result. `src/trace.ts` joins them into requirement, scenario, worst step status. A requirement is done when it has at least one scenario and all pass; one without scenarios shows as `NOT COVERED`. The results go to `spec_results` so the matrix is queryable.
- **Trade-offs**: every step is a regular-expression-like contract between prose and code, and a large suite turns into a maintenance job of its own (step reuse, ambiguous steps, slow end-to-end steps). Keep scenarios at the business-rule level against the domain, as here, and test the UI elsewhere (22). The value comes from the conversation that produces the examples (example mapping, three amigos); feature files written by developers alone are just verbose tests.

### Proof (`logs/23-specs.log`)

The naive implementation, written from the one-line ticket, fails the agreed examples. Cucumber names the scenario, the example row and the step (abridged):

```
6) Scenario: Yesterday is refused, today and later are accepted # features/change-bank-details.feature:77
   ✔ When "alice" requests to be paid into "FR7600000000000000033333333" from 2026-03-10 # src/steps.ts:52
   ✖ Then the request is "pending" # src/steps.ts:68
       Error: no request was recorded: refused with "effective date is in the past"

13 scenarios (6 failed, 7 passed)
   cucumber-js exit code (IMPL=naive): 1
```

The traceability report rolls those failures up to requirements (abridged):

```
   REQ-02 | Above 1,000.00 a month, a change needs approvals from two different staff members  => FAILING (2/5)
          | One approval is enough up to the threshold, not above it [1000.00, approved]                                  | passed
          | One approval is enough up to the threshold, not above it [1000.01, awaiting second approval]                  | failed
          | The same staff member cannot give both approvals                                                              | failed
   REQ-03 | Nobody can approve a request they made, or one that changes their own account  => FAILING (3/3)
          | A member cannot approve a request staff entered for them                                                      | failed
   REQ-04 | The effective date cannot be in the past  => FAILING (1/3)
          | Yesterday is refused, today and later are accepted [2026-03-10, "pending"]                                    | failed
   REQ-05 | Once approved, the new account is used from the effective date, and the old one before it  => passing (1)
```

The same feature file against the domain implementation passes, and every requirement is covered:

```
13 scenarios (13 passed)
84 steps (84 passed)
   cucumber-js exit code (IMPL=domain): 0
   5 requirements, 13 scenarios, all passing
```

The matrix in Postgres, both runs side by side:

```
 requirement | scenarios | naive_passed | domain_passed
-------------+-----------+--------------+---------------
 REQ-01      |         1 |            1 |             1
 REQ-02      |         5 |            3 |             5
 REQ-03      |         3 |            0 |             3
 REQ-04      |         3 |            2 |             3
 REQ-05      |         1 |            1 |             1
```

### Origins and further reading

- Article: "Introducing BDD", Dan North, 2006. https://dannorth.net/introducing-bdd/
- Book: *Specification by Example*, Gojko Adzic, 2011. https://gojko.net/books/specification-by-example/
- Book: *The Cucumber Book* (2nd edition), Matt Wynne, Aslak Hellesøy and Steve Tooke, 2017. https://pragprog.com/titles/hwcuc2/the-cucumber-book-second-edition/
- Article: "Introducing Example Mapping", Matt Wynne, 2015. https://cucumber.io/blog/bdd/example-mapping-introduction/
- Docs: Gherkin reference (`Rule`, `Scenario Outline`, tags). https://cucumber.io/docs/gherkin/reference/
- Docs: Cucumber messages, the protocol behind `--format message`. https://github.com/cucumber/messages

---

## 24. Characterization tests and a golden master (`24-characterization/`)

**Pain: rewriting rules nobody can state.** The contribution calculation lives in a PL/pgSQL function written years ago. The booklet describes it in one sentence, and the code does something else: it truncates instead of rounding, skips the month for members who join after the 15th, caps the salary before the offset instead of after, drops amounts under 10.00, and counts age as days / 365. A rewrite from the booklet differs on half the cases, and without a record of what legacy does, those differences reach members' statements first.

**Reach for it when** you rewrite or refactor logic whose behaviour is only known by running it (a calculation, an eligibility rule, a stored procedure), the logic is deterministic, and you can call it with inputs you choose.

**Do not reach for it when** the rules are already specified and tested: write the tests from the spec (23). The output depends on time, randomness or external state you cannot pin. Nobody will keep any of the legacy behaviour: a golden master of answers you have decided are wrong is only a list of differences to ignore. You need real traffic rather than generated inputs: run both side by side in production (04).

The legacy function (`sql/legacy.sql`) is loaded into Postgres as found. The demo generates inputs, records the legacy outputs into a committed approval file, runs the TypeScript rewrite against it, explains every mismatch with a rule, records a decision per rule, and ends with a rewrite that matches legacy except where a decision fixes a bug on purpose. The learned rules are written out as a decision table.

### Concepts

- **Characterization test**: a test that records what the code *does*, not what it should do. You do not judge the output while recording; legacy is the reference, bugs included, until someone decides otherwise.
- **Golden master / approval file**: run many inputs through legacy once and store inputs and outputs in a file under version control (`approved/legacy.approved.tsv`, 1352 cases). Each run writes `legacy.received.tsv` and compares; a difference means the legacy code or the generator changed, and approving the new file is a reviewed commit. The rewrite is then checked against the file, not against the legacy system, so the check still runs after legacy is switched off.
- **Inputs that find the rules**: boundary values on every threshold the code might have (salary 5,999.99 / 6,000.00 / 6,000.01, 149,999.99 / 150,000.00 / 150,000.01, the amounts where the monthly result crosses 10.00 at each rate, 35th and 50th birthdays shifted by 1 to 31 days, join days 15 and 16, month ends, 29 February), plus 1000 cases from a seeded PRNG (mulberry32, seed 2026) so the file is the same on every run. Random cases alone rarely hit an exact boundary; boundaries alone miss interactions between rules.
- **From mismatches to rules**: each pattern in the mismatches becomes a hypothesis, implemented as a flag in the rewrite (`truncateToCent`, `midMonthCutoff`, ...). A mismatch is explained by the smallest set of flags that reproduces the legacy output exactly; a mismatch nothing explains means a rule is still undiscovered. Two of the groups need two rules at once (an amount truncated to 9.99 and then dropped as under 10.00).
- **Keep the quirk or fix it on purpose**: every learned rule gets a decision with a reason in `src/decisions.ts`. Kept rules become the rewrite's behaviour, even when they look odd (truncation, the 15th cut-off), because members, employers and past statements already depend on them. Fixed rules (the leap-year age) form the allowlist: their mismatches are expected, and only those.
- **Green bar**: every case is equal, or differs only where a documented fix says it must. Zero unexplained mismatches. A later change that silently alters behaviour (rounding instead of truncating) produces unexplained mismatches and turns the check red.
- **Decision table**: the rules written for people, one row per condition and outcome, with where each came from and what was decided (`decision-table.md`). It is the spec the booklet should have been, and the input to the conversation with the business about each fix.
- **Trade-offs**: a golden master only covers the inputs you generated; a rule triggered by a combination you never produced stays hidden, which is why production comparison (04) is the next step. It pins behaviour, not intent, so it makes every change look like a regression until someone decides; keep the allowlist small and reasoned. Generated inputs must be realistic enough (valid dates, plausible salaries) or the mismatches are noise.

### Proof (`logs/24-characterization.log`)

The rewrite from the booklet differs from legacy on half the cases; one example per pattern:

```
   676 of 1352 cases differ
   #19    salary    7333.33  born 1995-06-15  joined 2010-01-04  period 2024-02-01  legacy     0.00  rewrite     5.56
   #27    salary    7714.28  born 1965-06-15  joined 2010-01-04  period 2024-02-01  legacy    12.85  rewrite    12.86
   #55    salary  156000.00  born 1995-06-15  joined 2010-01-04  period 2024-02-01  legacy   600.00  rewrite   625.00
   #63    salary   48000.00  born 1989-02-02  joined 2010-01-04  period 2024-02-01  legacy   245.00  rewrite   175.00
   #86    salary   48000.00  born 1980-06-15  joined 2024-02-16  period 2024-02-01  legacy     0.00  rewrite   245.00
```

Every mismatch is explained by the smallest set of hypotheses that reproduces the legacy output:

```
    417  truncateToCent
    114  capSalaryBeforeOffset
     53  midMonthCutoff
     41  ageByDaysOver365
     38  deMinimis
     12  truncateToCent + deMinimis
      1  ageByDaysOver365 + truncateToCent
```

The final rewrite keeps four quirks and fixes one; the remaining differences are all on the allowlist. A regression is caught (abridged):

```
   1352 cases: 1310 equal, 42 allowlisted (ageByDaysOver365), 0 unexplained

## 7. The golden master catches a regression
   430 unexplained mismatches, for example:
   #21    salary    7333.33  born 1965-06-15  joined 2010-01-04  period 2024-02-01  legacy     0.00  rewrite    10.00
```

The leap-year bug, read from the golden master in SQL: legacy counts days / 365, so members are charged the next band's rate up to 9 days before their 35th birthday and 13 days before their 50th:

```
 legacy_age | real_age | count | min_days_to_birthday | max_days_to_birthday | legacy | rewrite
------------+----------+-------+----------------------+----------------------+--------+---------
         35 |       34 |    15 |                    1 |                    9 | 245.00 |  175.00
         50 |       49 |    26 |                    1 |                   13 | 315.00 |  245.00
```

The rates implied by the legacy outputs, by calendar age: the bands are 5/7/9%, except for the members the bug moved up early:

```
 calendar_age | implied_rate | count
--------------+--------------+-------
 under 35     |         0.05 |   310
 under 35     |         0.07 |    15
 35 to 49     |         0.07 |   290
 35 to 49     |         0.09 |    27
 50 and over  |         0.09 |   434
```

The decision table, generated from the decisions and the mismatch counts (two rows shown):

```
   | R3 | joined in the period's month after the 15th | 0.00 for that month | legacy, 53 mismatches | keep: payroll closes on the 15th; the booklet never said so, but every employer's payroll relies on it |
   | R5 | age on the 1st of the period: under 35 / 35 to 49 / 50 and over | rate 5% / 7% / 9% of pensionable salary | legacy, 42 mismatches | fix: legacy counts age as days / 365, so leap days make members older: up to 9 days before a 35th birthday and 13 before a 50th they pay the higher rate |
```

### Origins and further reading

- Book: *Working Effectively with Legacy Code*, Michael Feathers, 2004 (characterization tests, chapter 13). https://www.oreilly.com/library/view/working-effectively-with/0131177052/
- Docs: ApprovalTests, Llewellyn Falco (approved and received files). https://approvaltests.com/
- Kata: Gilded Rose refactoring kata, Emily Bache (a classic golden-master exercise). https://github.com/emilybache/GildedRose-Refactoring-Kata
- Article: "Patterns of Legacy Displacement", Ian Cartwright, Rob Horn and James Lewis, 2022-2024. https://martinfowler.com/articles/patterns-legacy-displacement/
- Docs: Decision Model and Notation (DMN), OMG, the standard form of decision tables. https://www.omg.org/dmn/

---

## 25. Bilingual English/French (`25-bilingual/`)

**Pain: a "translated" page that is still English underneath.** The strings were translated, but the code concatenates `"€" + amount.toFixed(2)`, prints `date.toDateString()`, builds plurals as `"request(s)"`, hard-codes a few labels and sets no `lang`. French members see `€4111.06`, `Sat Jan 31 2026` and `You have 0 pending request(s)` on a page a screen reader reads with the wrong voice. A translator renames `{count}` to `{nombre}` and the page breaks at runtime; the French button label does not fit the fixed-width button.

**Reach for it when** a product serves more than one language (bilingual regions often require it by law, or members live in several countries), or will: retrofitting catalogues, `Intl` formatting and `lang` later means touching every view.

**Do not reach for it when** there is one language and no plan for another: still format numbers and dates with `Intl` (it costs nothing), but a catalogue and negotiation layer are overhead. You need right-to-left scripts, translation memory or a translation management workflow: this sample covers the code side only.

A `node:http` server renders the same member page in English and French: messages in ICU MessageFormat (`messages/en.json`, `messages/fr.json`) formatted with `intl-messageformat`, numbers, money and dates with `Intl`, the locale chosen from `Accept-Language` or `?lang=`. `/naive` is the page as first written. A client fetches both with different headers, checks the catalogues against each other, and scans a pseudo-localised render for anything that skipped the catalogue.

### Concepts

- **ICU MessageFormat**: one message per sentence, with typed arguments: `{count, plural, one {# pending request} other {# pending requests}}`, `{role, select, member {...} employer {...} other {...}}`, `{amount, number, ::currency/EUR}`, `{date, date, long}`. The translator gets the whole sentence and can reorder it; the code never concatenates fragments.
- **CLDR plural rules**: categories differ by language. English puts 0 in `other` (`0 pending requests`), French in `one` (`0 demande en attente`). Hand-written `count === 1 ? "" : "s"` is wrong in French and in most other languages (Polish has four categories, Arabic six).
- **Gender-free wording**: French adjectives and many nouns agree with the person's gender, which the portal does not know and should not ask. The French catalogue names functions instead of people (`Administration employeur` rather than administrateur/administratrice), uses epicene nouns (`Membre`), and rephrases verbs (`Dernière connexion le ...` rather than "vous vous êtes connecté(e)"). A `select` on gender would also work but needs data the portal does not keep.
- **`Intl` formatting**: `Intl.NumberFormat` and `Intl.DateTimeFormat` know the separators, currency position and month names: `€1,234.56` in `en-GB`, `1 234,56 €` in `fr-FR`, where the group separator is U+202F (narrow no-break space) and the space before `€` is U+00A0, so the amount never wraps. French typography also puts a no-break space before `:` (the catalogue carries it) and `%` (`Intl` adds it). The language decides the catalogue; the formatting locale (`en` formats as `en-GB`) decides the formats.
- **Locale negotiation**: `Accept-Language` lists ranges with q-values (RFC 9110). Sort by q, drop `q=0` ("not this one"), match the exact tag then the primary language (`fr-CA` gets `fr`, RFC 4647 lookup), and fall back to a default. A language refused with `q=0` is never chosen, also not through `*` ("anything else"): `en;q=0, *` gets French, not the English default. An explicit choice (`?lang=`, a link, a saved preference) wins over the header, because people often browse with a browser set to a language they do not prefer. The response says `Content-Language` and `Vary: Accept-Language`, so caches keep one copy per language.
- **Catalogue check**: the reference catalogue (English) defines the keys and the arguments. Every other catalogue must have exactly the same keys, every message must parse, use the same arguments with the same types (a `{amount}` that lost `number` prints `1234.56`), and the same `select` cases. Run as `npm run check` in CI, so a broken translation fails the build instead of the page.
- **Pseudo-localisation**: a generated locale (`en-XA`) where every catalogue string is accented, 40% longer and wrapped in `⟦ ⟧`, with ICU arguments, plurals and `#` kept (parse, transform the literal nodes, print the AST back). It is readable, so anyone can click through the app in it before any translation exists; any readable text without brackets skipped the catalogue, and anything that overflows will overflow in French or German. The scanner skips text marked `translate="no"` (employer names, data) and text in another declared language.
- **`lang` attribute**: `<html lang>` selects the screen reader voice, hyphenation and quotes (WCAG 3.1.1). A passage in another language carries its own `lang` (3.1.2): the language switcher shows `Français` with `lang="fr"` on the English page.
- **Trade-offs**: ICU syntax is strict and translators need tooling that understands it (a message with a stray `{` does not parse). Catalogues as flat JSON with dotted keys are simple but give translators no context; add descriptions or screenshots. The pseudo-locale catches what the server renders; strings built in client-side code need the same check in the browser.

### Proof (`logs/25-bilingual.log`)

Locale negotiation: the best supported range wins, `q=0` excludes (also from `*`), unknown languages fall back to English, an explicit choice overrides the header (abridged):

```
   GET /          Accept-Language: fr-CA,fr;q=0.9,en;q=0.8            -> Content-Language: fr, <html lang="fr">, Vary: Accept-Language
   GET /          Accept-Language: de-DE,de;q=0.9,fr;q=0.5,en;q=0.3   -> Content-Language: fr, <html lang="fr">, Vary: Accept-Language
   GET /          Accept-Language: fr;q=0,en;q=0.5                    -> Content-Language: en, <html lang="en">, Vary: Accept-Language
   GET /          Accept-Language: de-CH                              -> Content-Language: en, <html lang="en">, Vary: Accept-Language
   GET /          Accept-Language: en;q=0, *                          -> Content-Language: fr, <html lang="fr">, Vary: Accept-Language
   GET /?lang=fr  Accept-Language: en-GB,en;q=0.9                     -> Content-Language: fr, <html lang="fr">, Vary: Accept-Language
```

The same data in both locales, and the naive page in French (⍽ is U+202F, · is U+00A0):

```
   en              total: Total: €4,111.06       rate: Contribution rate: 7%          row: 31 Jan 2026 | €1,234.56    Last signed in on 28 September 2026
   fr              total: Total·: 4⍽111,06·€     rate: Taux de cotisation·: 7·%       row: 31 janv. 2026 | 1⍽234,56·€ Dernière connexion le 28 septembre 2026
   fr, naive page  total: Total: €4111.06        rate: (none)                         row: Sat Jan 31 2026 | €1234.56 
```

Plural categories from CLDR, and the role `select` with gender-free French:

```
   alice  en: 0 pending requests   Hello Alice, Member                  fr: 0 demande en attente   Bonjour Alice, Membre
   bob    en: 1 pending request    Hello Bob, Employer administrator    fr: 1 demande en attente   Bonjour Bob, Administration employeur
   carol  en: 2 pending requests   Hello Carol, Portal staff            fr: 2 demandes en attente  Bonjour Carol, Équipe du portail
```

The catalogue check on a French catalogue with typical translation mistakes, then on the real one:

```
   fixtures/fr.broken.json: missing key "action.logout"
   fixtures/fr.broken.json: unknown key "action.logoff" (not in the reference)
   fixtures/fr.broken.json: "greeting" does not parse: EXPECT_ARGUMENT_CLOSING_BRACE
   fixtures/fr.broken.json: "role" select {role} has cases [member,other], the reference [employer,member,other]
   fixtures/fr.broken.json: "pending" lacks argument {count}
   fixtures/fr.broken.json: "pending" uses argument {nombre} that the code never passes
   fixtures/fr.broken.json: "contributions.total" formats {amount} as string, the reference as number
   messages/fr.json against messages/en.json: 0 problems
```

Pseudo-localisation finds what skipped the catalogue on the naive page, and the button that will not fit; the fixed page is clean (abridged):

```
   /naive?lang=en-XA: 9 hard-coded strings, 1 overflow
     hard-coded: "You have 0 pending request(s)"
     hard-coded: "Sat Jan 31 2026"
     hard-coded: "Total: €4111.06"
     hard-coded: "Sign out"
     overflow: <button> "⟦Ŕéqúéšţ á çĥáñğé·······⟧" is 25 characters in a 18ch box
     overflow in real French too: <button> "Demander une modification" is 25 characters in a 18ch box
   /?lang=en-XA: 0 hard-coded strings, 0 overflow
     sample: ⟦Ýóúŕ mémƀéŕ áççóúñţ········⟧  ⟦0 péñðíñğ ŕéqúéšţš·······⟧  ⟦Ţóţáļ: €4,111.06···⟧
```

### Origins and further reading

- Docs: ICU User Guide, Formatting Messages (MessageFormat). https://unicode-org.github.io/icu/userguide/format_parse/messages/
- Docs: CLDR Language Plural Rules, Unicode. https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html
- Docs: FormatJS `intl-messageformat` and the ICU message parser. https://formatjs.github.io/docs/intl-messageformat/
- Docs: `Intl` on MDN. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl
- RFC: RFC 4647, Matching of Language Tags, Addison Phillips and Mark Davis, 2006. https://www.rfc-editor.org/rfc/rfc4647 ; RFC 9110 section 12.5.4, Accept-Language, 2022. https://www.rfc-editor.org/rfc/rfc9110#name-accept-language
- Article: "Declaring language in HTML", Richard Ishida, W3C Internationalization. https://www.w3.org/International/questions/qa-html-language-declarations
- Docs: WCAG 2.2 Understanding 3.1.1 Language of Page and 3.1.2 Language of Parts. https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html
- Article: "Pseudo Localization @ Netflix", Tim Brandall, 2017. https://netflixtechblog.com/pseudo-localization-netflix-12fff76fbcbe
- Docs: MessageFormat 2, the Unicode working group's successor syntax. https://github.com/unicode-org/message-format-wg

---

## 26. Single sign-on with OpenID Connect (`26-sso/`)

**Pain: every app keeps its own passwords, and a hand-rolled login trusts whatever comes back.** Members, employer HR staff and the IT team each have one more password per app, nobody can switch an account off in one place, and roles are granted by hand in each app. When an app does delegate login, the first version takes the `code` from the redirect and the claims from the token without checking which browser started the login, whether the code was already used, who the token was minted for, or whether it was altered.

**Reach for it when** people already have an account in an identity provider (Entra ID, Keycloak, Okta, an organisation's own IdP) and the app should sign them in through it, with roles derived from groups the IdP manages, and several apps should share one sign-in.

**Do not reach for it when** the caller is a machine, not a person: use the client credentials grant or mTLS. The app is a single-page or mobile app with no server side: the flow is the same but the client is public (no secret) and the tokens live on the device, so put a backend-for-frontend in front if you can. The app has a handful of local users and no IdP to delegate to: passwords with a second factor, or passkeys, are simpler than running an IdP.

An OpenID Provider (`oidc-provider`, its own process on :53036, reached as `127.0.0.1`) with four accounts, and a member portal (Express on :53037, reached as `localhost`) that uses `openid-client` as the relying party and keeps users, role mappings, login transactions and sessions in Postgres. The demo plays the browsers with `fetch` and a cookie jar per host, follows every redirect by hand and logs each hop. The two hostnames keep the IdP's cookies and the app's cookies apart, as on two real sites.

### Concepts

- **Relying party and OpenID Provider**: the app (relying party, RP) never sees a password. It sends the browser to the IdP (OpenID Provider, OP), which authenticates the person and sends the browser back with a short-lived authorization code. The app then calls the IdP's token endpoint directly, with its client secret, and receives an ID token (who signed in) and an access token.
- **Discovery**: the app reads `/.well-known/openid-configuration` at start and takes the endpoints, the signing keys (`jwks_uri`) and the supported methods from it. Only the issuer URL, the client id and the secret are configured.
- **Authorization code flow with PKCE**: before redirecting, the app makes a random `code_verifier`, keeps it server-side and sends only its SHA-256 (`code_challenge`, `S256`). Redeeming the code requires the verifier, so a code that leaks (from a log, a proxy, a browser history, a malicious app registered on the same redirect) is useless on its own. The IdP here requires PKCE even from this confidential client, as OAuth 2.1 and the OAuth security BCP (RFC 9700) recommend.
- **State**: a random value the app stores with the login and the IdP echoes back. A callback whose state the app did not issue is rejected, so an attacker cannot make a victim's browser complete the attacker's login (login CSRF).
- **Nonce**: a random value sent in the authorization request that the IdP copies into the ID token. The app accepts the ID token only if it carries the nonce of this login, so a token minted for another login cannot be injected.
- **Login transaction**: state, nonce, verifier and `returnTo` are a row in `login_transactions`, found through an HttpOnly `login_tx` cookie scoped to `/callback` and deleted as it is read (`DELETE ... RETURNING`). A callback is therefore usable once, and only in the browser that started it. A login abandoned at the IdP never reaches the callback; its row expires after 10 minutes and the next `/login` deletes it. `returnTo` is resolved against the app's origin the way the browser will resolve the redirect (`/\evil.example` and `//evil.example` both name another host) and kept, as path and query, only if it stays on the app; anything else becomes `/`, so the login cannot be turned into an open redirect.
- **ID token validation**: a JWT signed by the IdP. The app checks the signature against the key from `jwks_uri` (`kid`), `iss` (this IdP), `aud` (this client), `exp` and `iat`, and the nonce. Over TLS from the token endpoint the signature check is optional (the TLS connection authenticates the IdP); the demo runs over plain HTTP, so `enableNonRepudiationChecks` turns it on.
- **Session cookie**: after the callback the app creates its own session: a random 256-bit id in an `HttpOnly; SameSite=Lax` cookie (add `Secure` over HTTPS), with only its SHA-256 stored in Postgres, so a database leak does not leak live sessions. A new id is issued at every login (no session fixation). The ID token is kept with the session for logout and is never in a cookie, but it does reach the browser once: as `id_token_hint` in the logout redirect to the IdP, so it appears in that URL and in the browser history (it identifies the user to the IdP, it does not grant access to the app).
- **Single sign-on**: the IdP has its own session cookie. When an app (or a second app) sends the browser to the IdP again, the IdP answers at once with a new code, without asking for the password.
- **Roles from a claim**: the IdP sends `groups` (and `member_no` for members) in a custom `portal` scope. `role_mappings` in Postgres turns groups into app roles: `member`, `employer-admin` of one employer, `staff`. The mapping is evaluated on every request, so changing it takes effect without a new login. Authenticated without a mapped role is 403, not a redirect to login, and an `employer-admin` is checked against the employer in the URL as well as the role.
- **Just-in-time provisioning**: a user row is upserted at each login, keyed by `(issuer, sub)`, never by email: `sub` is the IdP's stable id, an email can change or be reused.
- **Logout**: the app deletes its session row (a replayed cookie is then worthless), then sends the browser to the IdP's `end_session_endpoint` with `id_token_hint` and `post_logout_redirect_uri` (RP-initiated logout); the IdP ends its own session, so the next login asks for the password again.
- **Trade-offs**: the IdP becomes a dependency of every login, so its availability is now yours. Logout only reaches the apps the browser passes through; other apps' sessions live until they expire unless you add back-channel or front-channel logout, and this sample's logout ends only the current app session (other sessions of the same user expire on their own; a "sign out everywhere" deletes all of the user's rows). The IdP here keeps its state in memory (oidc-provider says so at start); a real one uses a persistent adapter. Groups in the ID token grow with the number of groups (Entra ID switches to an overage claim past 200); map few, coarse groups. Roles are checked at login and per request against the mapping, but group changes at the IdP only arrive at the next login.

### Proof (`logs/26-sso.log`)

Alice signs in. The authorization request carries state, nonce and the S256 code challenge, never the verifier; the IdP asks for her password, then redirects back with a code; the app sets its own HttpOnly session cookie:

```
   alice: GET localhost:53037/login?returnTo=/me -> 302 -> 127.0.0.1:53036/auth?redirect_uri=http://localhost:53037/callback&scope=openid ema...&state=cojUcQbnDK...&nonce=5rmgg2e4xB...&code_challenge=rkipKjgzec...&code_challenge_method=S256&client_id=member-portal&response_type=code [set-cookie: login_tx (HttpOnly)]
   alice: GET 127.0.0.1:53036/auth?redirect_uri=http://localhost:53037/callback&scope=openid ema...&state=cojUcQbnDK...&nonce=5rmgg2e4xB...&code_challenge=rkipKjgzec...&code_challenge_method=S256&client_id=member-portal&response_type=code -> 303 -> 127.0.0.1:53036/interaction/<uid> [set-cookie: _interaction (HttpOnly), _interaction.sig (HttpOnly), _interaction_resume (HttpOnly), _interaction_resume.sig (HttpOnly)]
   alice: GET 127.0.0.1:53036/interaction/<uid> -> 200
   alice: POST 127.0.0.1:53036/interaction/<uid>/login -> 303 -> 127.0.0.1:53036/auth/<uid>
   alice: GET 127.0.0.1:53036/auth/<uid> -> 303 -> localhost:53037/callback?code=99ikucdi_f...&state=cojUcQbnDK...&iss=http://127... [set-cookie: _interaction_resume (HttpOnly), _interaction_resume.sig (HttpOnly), _session (HttpOnly), _session.sig (HttpOnly)]
   alice: GET localhost:53037/callback?code=99ikucdi_f...&state=cojUcQbnDK...&iss=http://127... -> 302 -> localhost:53037/me [set-cookie: login_tx, sid (HttpOnly)]
   alice: GET localhost:53037/me -> 200
   alice /me -> 200 {"member_no":"M0001","employer":"acme","name":"Alice Martin","address":"1 rue des Lilas, Lyon"}
   app cookie sid is opaque (43 chars), HttpOnly, SameSite=Lax; Postgres stores only its sha256. Login transactions left: 0
```

The ID token, and the same validation run on modified copies: changing the groups breaks the signature, another audience and a later time are refused:

```
   header: {"alg":"RS256","kid":"idp-key-1"}
   claims: {"iss":"http://127.0.0.1:53036","aud":"member-portal","sub":"alice","nonce":"5rmgg2e4xB...","groups":["portal-members"],"member_no":"M0001","lifetime_s":300}
   the token as issued                                        -> valid
   groups changed to it-staff, original signature             -> rejected: signature verification failed
   presented to another app (audience other-app)              -> rejected: unexpected "aud" claim value
   presented 10 minutes later                                 -> rejected: "exp" claim timestamp check failed
```

Single sign-on: with the app session gone but the IdP session alive, the IdP answers with a code at once:

```
   alice: GET localhost:53037/login?returnTo=/me -> 302 -> 127.0.0.1:53036/auth?redirect_uri=http://localhost:53037/callback&scope=openid ema...&state=6sZ8IF3PU5...&nonce=5xJiFFzz_h...&code_challenge=4rsrAQYJD5...&code_challenge_method=S256&client_id=member-portal&response_type=code [set-cookie: login_tx (HttpOnly)]
   alice: GET 127.0.0.1:53036/auth?redirect_uri=http://localhost:53037/callback&scope=openid ema...&state=6sZ8IF3PU5...&nonce=5xJiFFzz_h...&code_challenge=4rsrAQYJD5...&code_challenge_method=S256&client_id=member-portal&response_type=code -> 303 -> localhost:53037/callback?code=HeyCV6rWBT...&state=6sZ8IF3PU5...&iss=http://127... [set-cookie: _session (HttpOnly), _session.sig (HttpOnly)]
   alice: GET localhost:53037/callback?code=HeyCV6rWBT...&state=6sZ8IF3PU5...&iss=http://127... -> 302 -> localhost:53037/me [set-cookie: login_tx, sid (HttpOnly)]
   alice: GET localhost:53037/me -> 200
   password asked: false
```

Roles from the `groups` claim: each user sees only the routes their mapped role allows; dave is signed in but has no mapped role, so everything is 403:

```
   alice GET /me                        -> 200 {"member_no":"M0001","employer":"acme","name":"Alice Martin","address":"1 rue des Lilas, Lyon"}
   alice GET /employers/acme/members    -> 403 {"error":"forbidden","need":["employer-admin","staff"],"have":["member"],"groups":["portal-members"]}
   alice GET /employers/globex/members  -> 403 {"error":"forbidden","need":["employer-admin","staff"],"have":["member"],"groups":["portal-members"]}
   alice GET /admin/users               -> 403 {"error":"forbidden","need":["staff"],"have":["member"],"groups":["portal-members"]}
   bob   GET /me                        -> 403 {"error":"forbidden","need":["member"],"have":["employer-admin"],"groups":["acme-hr"]}
   bob   GET /employers/acme/members    -> 200 [{"member_no":"M0001","name":"Alice Martin"},{"member_no":"M0002","name":"Erin Laurent"}]
   bob   GET /employers/globex/members  -> 403 {"error":"forbidden","detail":"employer-admin of acme cannot read globex"}
   bob   GET /admin/users               -> 403 {"error":"forbidden","need":["staff"],"have":["employer-admin"],"groups":["acme-hr"]}
   carol GET /me                        -> 403 {"error":"forbidden","need":["member"],"have":["staff"],"groups":["it-staff"]}
   carol GET /employers/acme/members    -> 200 [{"member_no":"M0001","name":"Alice Martin"},{"member_no":"M0002","name":"Erin Laurent"}]
   carol GET /employers/globex/members  -> 200 [{"member_no":"M0003","name":"Frank Girard"}]
   dave  GET /me                        -> 403 {"error":"forbidden","need":["member"],"have":[],"groups":["marketing"]}
   dave  GET /employers/acme/members    -> 403 {"error":"forbidden","need":["employer-admin","staff"],"have":[],"groups":["marketing"]}
   dave  GET /employers/globex/members  -> 403 {"error":"forbidden","need":["employer-admin","staff"],"have":[],"groups":["marketing"]}
   dave  GET /admin/users               -> 403 {"error":"forbidden","need":["staff"],"have":[],"groups":["marketing"]}
```

The rejected cases: a forged state, a replayed callback and a replayed code, an intercepted code without the verifier (the real browser can still use it afterwards), an ID token minted for another nonce, and a `returnTo` that the browser would resolve to another host (the login succeeds but lands on `/`):

```
   a) the callback carries a state the app did not issue (an attacker's callback link)
     state -> {"error":"login rejected","detail":"invalid response encountered: unexpected \"state\" response parameter value"}
   b) the genuine callback, then the same URL again (a replay from history or a log)
     replay -> {"error":"no login in progress in this browser (expired, already used, or started elsewhere)"}
     the same code redeemed again at the token endpoint, with the client secret and the right verifier -> 400 {"error":"invalid_grant","error_description":"grant request is invalid"}
   c) an intercepted code, redeemed by someone who has the client secret but not the verifier
     without code_verifier -> 400 {"error":"invalid_grant","error_description":"grant request is invalid"}
     with a guessed code_verifier -> 400 {"error":"invalid_grant","error_description":"grant request is invalid"}
   d) the authorization request is altered to carry another nonce (an ID token minted for another login)
     nonce -> {"error":"login rejected","detail":"unexpected JWT claim value encountered: unexpected ID Token \"nonce\" claim value"}
   e) a login link whose returnTo points to another site (the login used as an open redirect); alice's browser, already signed in at the IdP
     returnTo=/\evil.example    -> signed in, lands on http://localhost:53037/
     returnTo=//evil.example    -> signed in, lands on http://localhost:53037/
     returnTo=/.//evil.example  -> signed in, lands on http://localhost:53037/
```

Logout: the app session row is deleted, the IdP ends its session after a confirmation form, and the next login asks for the password again:

```
   alice: POST localhost:53037/logout -> 303 -> 127.0.0.1:53036/session/end?id_token_hint=eyJhbGciOi...&post_logout_redirect_uri=http://localhost:53037/logged-out&client_id=member-portal [set-cookie: sid]
   alice: GET 127.0.0.1:53036/session/end?id_token_hint=eyJhbGciOi...&post_logout_redirect_uri=http://localhost:53037/logged-out&client_id=member-portal -> 200 [set-cookie: _session (HttpOnly), _session.sig (HttpOnly)]
   alice: POST 127.0.0.1:53036/session/end/confirm -> 303 -> localhost:53037/logged-out [set-cookie: _session (HttpOnly), _session.sig (HttpOnly)]
   alice: GET localhost:53037/logged-out -> 200
   the old sid cookie replayed: GET /me -> 302 /login?returnTo=%2Fme
   signing in again: password asked: true
```

### Origins and further reading

- Spec: OpenID Connect Core 1.0, OpenID Foundation, 2014 (ID token, nonce, ID token validation). https://openid.net/specs/openid-connect-core-1_0.html
- Spec: OpenID Connect Discovery 1.0, OpenID Foundation, 2014. https://openid.net/specs/openid-connect-discovery-1_0.html
- Spec: OpenID Connect RP-Initiated Logout 1.0, OpenID Foundation, 2022. https://openid.net/specs/openid-connect-rpinitiated-1_0.html
- RFC: 6749 "The OAuth 2.0 Authorization Framework" (authorization code grant, state), 2012. https://www.rfc-editor.org/rfc/rfc6749
- RFC: 7636 "Proof Key for Code Exchange by OAuth Public Clients" (PKCE), 2015. https://www.rfc-editor.org/rfc/rfc7636
- RFC: 9700 "Best Current Practice for OAuth 2.0 Security", 2025 (PKCE for every client, code replay, mix-up and injection attacks). https://www.rfc-editor.org/rfc/rfc9700
- RFC: 7519 "JSON Web Token (JWT)", 2015. https://www.rfc-editor.org/rfc/rfc7519
- Docs: `oidc-provider`, Filip Skokan (the OpenID Provider used here). https://github.com/panva/node-oidc-provider
- Docs: `openid-client`, Filip Skokan (the relying party library used here). https://github.com/panva/openid-client
- Docs: OWASP Session Management Cheat Sheet (cookie attributes, rotation on login). https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

---

## 27. Monthly data import from CSV files (`27-import/`)

**Pain: a monthly data load that duplicates on rerun and half-applies on a bad row.** Employers send CSV files of members and contributions. The first version inserts row by row: running it twice doubles every contribution, and a typo on line 4 leaves lines 2 and 3 applied and the rest missing, so the corrected resend duplicates them. Nobody can say which file produced which row, or whether the table adds up to what the employer sent.

**Reach for it when** files from outside (employers, partners, a legacy export) feed tables you own on a schedule, files can be resent, late, truncated or wrong, and someone has to answer "what did we load from whom, and does it add up".

**Do not reach for it when** the source can call an API one record at a time and get an answer back: validate at the API instead (06, 07). The data is large enough that one transaction per file holds locks too long: load per partition (13) or into a new table and swap it in. The source is a database you can read: stream its changes (10) instead of exporting files.

A loader for files named `<employer>-<YYYY-MM>-<members|contributions>[-suffix].csv`, each with a `.ctl` control file declaring its row count (and, for contributions, the amount total). It streams the file with `COPY` into a staging table, validates it in SQL into `import_rejects`, computes a diff, upserts the valid rows on the natural key and records the batch with the file's sha256, all in one transaction. A naive row-by-row loader runs first on the same files to show the pain.

### Concepts

- **Natural key**: what identifies a row in the business, here `(employer, member_no)` for a member and `(employer, member_no, period)` for a contribution. It is the target table's primary key, so a duplicate cannot exist whatever the loader does. A surrogate `id SERIAL` alone, as in the naive table, lets every rerun append the same rows again.
- **Staging table and `COPY`**: the file is streamed with `COPY ... FROM STDIN (FORMAT csv, HEADER match)` into a `TEMP` table whose columns are all `text`, plus a `line_no` identity, so a malformed value never aborts the load: it becomes a reject with its line number. `HEADER match` (PostgreSQL 15+) refuses a file whose column names or order differ from what is expected, instead of loading amounts into the period column. `COPY` is one round trip for the whole file, against one per row for `INSERT`.
- **Validation in SQL, rejects with reasons**: each rule is a SQL condition on the staged row (`src/kinds.ts`): types with `pg_input_is_valid` (PostgreSQL 16, no exception on `1987-02-30` or `18O.00`), an ISO date format so `02/03/1987` is not read in the server's DateStyle, referential checks (the member exists for that employer), business rules (the period is the file's month, no negative amounts, the sender is the employer named in the file), and duplicate keys inside the file. One row per broken rule goes to `import_rejects` with the raw line as JSONB, so a line with three problems is reported once with three reasons, and the employer can fix them all in one go.
- **Dry run**: the same code path in a transaction that is rolled back: it prints the rejects, the diff and what the upsert would write, and leaves no row behind (not even the batch row). Operators run it before applying a file that looks unusual.
- **Diff**: valid rows compared to the target on the natural key: new (no row yet), changed (with the old and new value of each changed column), unchanged, and missing (in the target for this employer and month, absent from the file). A missing member is reported, not deleted: absence can mean a leaver or a forgotten line; a leaver is an explicit status the employer sends.
- **Upsert, idempotent**: `INSERT ... ON CONFLICT (natural key) DO UPDATE ... WHERE ROW(columns) IS DISTINCT FROM ROW(EXCLUDED.columns)`. Unchanged rows are not rewritten (no new row version, no dead tuple, no update trigger, and `last_batch_id` keeps pointing at the batch that last changed them), and `RETURNING (xmax = 0)` counts inserts against updates.
- **One transaction per file**: the batch row, the rejects and the upsert commit together, so a crash or a refused file leaves nothing half-applied. `pg_advisory_xact_lock` on the employer and file kind serialises two imports of the same feed.
- **Batch record and file hash**: every file gets an `import_batches` row with its sha256 and counts. A partial unique index (`UNIQUE (sha256) WHERE status = 'applied'`) allows one applied batch per content, so the same file again, even renamed, is a no-op (`INSERT ... ON CONFLICT DO NOTHING`). A refused file is recorded with its reason and its rejects, and can be sent again once fixed.
- **Control totals and reconciliation**: the sender declares the row count and the amount total in a control file. A count that differs means a truncated or padded file and refuses it whole. A contributions file whose `.ctl` has no `amount=` is refused: its total cannot be verified. The declared amount must equal the sum of every amount that parses, accepted or rejected; an amount that does not parse (`18O.00`) cannot be counted, so a file with one passes only if the sender's total left it out too, and is otherwise refused with a control-total mismatch. After the load, the target is reconciled with the batch log without assuming each file replaces the month: only batches write contributions, by insert or update and never delete, so per employer and month the rows equal the sum of what each applied batch inserted, and the amount total equals the sum of each batch's net change (`amount_net`: new minus old amount over the rows it wrote). Each row's `last_batch_id` must also point at an applied batch of its employer and month.
- **Whole-file refusal**: valid rows are applied and rejects reported, unless the file's shape is wrong: wrong header, row count mismatch, more than half the rows rejected (here: Globex sent contributions before its members file), or a control total that does not add up. Applying 0 of 3 rows would only hide the real problem. The refused batch keeps its rejects: the transaction that wrote them is rolled back, so they are written again under the refused batch's id, and the employer gets every reason.
- **Trade-offs**: rules in SQL are fast and set-based but harder to unit-test than code; keep them in one declarative list. Applying valid rows while rejecting others means a month can be partly loaded until the corrected file arrives; when that is not acceptable (a payroll run), refuse any file with a reject. A big file in one transaction holds row locks on the rows it touches until commit; load into a new table and swap it in, or apply per employer and month. Batch ids have gaps: a rolled-back or skipped `INSERT` still uses a sequence value.

### Proof (`logs/27-import.log`)

The naive loader: a rerun doubles the rows and the total; a bad line half-applies the file, and the corrected resend duplicates what had been committed:

```
   run 1: inserted 6 -> naive_contributions has 6 rows, total 1500.75
   run 2: inserted 6 -> naive_contributions has 12 rows, total 3001.50
   acme-2026-09-contributions.csv: inserted 2, then line 4: invalid input syntax for type numeric: "18O.00"
   naive_contributions: 2 rows (half-applied), total 560.50
   corrected file resent: inserted 6 -> 8 rows, total 1736.00 (the file says 1175.50); duplicated: M0001 x2, M0002 x2
```

The dry run of September's members file: one reject with its reason, the diff with the changed column, and nothing written:

```
   acme-2026-09-members.csv [sha256 c1f47ccd29c0] -> DRY RUN (rolled back)
     rows: declared 6, received 6, rejected 1
     reject line 5 [birth_date] birth_date '1987-02-30' is not a YYYY-MM-DD date
     diff: new 1 ["M0007"], changed 1, unchanged 3, missing 1 ["M0004"]
       changed M0001 email: alice@acme.example -> alice.martin@acme.example
     upsert: inserted 1, updated 1
   members after the dry run: 6 rows, M0001 email still alice@acme.example; batches applied: 2
```

September's contributions: five valid rows applied, line 8 rejected for three reasons at once, and the control total matching the amounts that parse (the employer's total, 1075.50, left out the unreadable `18O.00` too):

```
   acme-2026-09-contributions.csv [sha256 add34e1f776c] -> APPLIED batch 5
     rows: declared 8, received 8, rejected 3
     reject line 4 [amount_type] amount '18O.00' is not a number
     reject line 8 [amount_sign] amount -120.00 is negative: corrections are sent as a corrected file, not a negative line
     reject line 8 [member] member M0009 is unknown for acme: send the members file first
     reject line 8 [period] period '2026-08' is not the file period 2026-09
     reject line 9 [duplicate] duplicate key, first seen on line 6
     diff: new 5 ["M0001/2026-09","M0002/2026-09","M0005/2026-09","M0006/2026-09","M0007/2026-09"], changed 0, unchanged 0, missing 0 []
     control total: declared 1075.50, amounts that parse 1075.50 (accepted 995.50 + rejected 80.00); 1 amount(s) not a number, counted on neither side
     upsert: inserted 5, updated 0
```

The same file again, and the same bytes under another name, then the corrected full month: one row inserted, five unchanged, no duplicate:

```
   acme-2026-09-contributions.csv [sha256 add34e1f776c] -> ALREADY APPLIED batch 5: same bytes as batch 5 (acme-2026-09-contributions.csv)
   acme-2026-09-contributions-resent.csv [sha256 add34e1f776c] -> ALREADY APPLIED batch 5: same bytes as batch 5 (acme-2026-09-contributions.csv)
   acme-2026-09-contributions-v2.csv [sha256 80ebe2eca757] -> APPLIED batch 8
     rows: declared 6, received 6, rejected 0
     diff: new 1 ["M0003/2026-09"], changed 0, unchanged 5, missing 0 []
     control total: declared 1175.50, amounts that parse 1175.50 (accepted 1175.50 + rejected 0)
     upsert: inserted 1, updated 0
```

Files refused as a whole: wrong columns, a truncated file, contributions for members not yet loaded, and an October file whose control total counts an amount that does not parse; the refused batches keep their rejects:

```
   initech-2026-09-contributions.csv [sha256 c932638267eb] -> REFUSED batch 10: COPY refused the file: column name mismatch in header line field 3: got "amount", expected "period"
   initech-2026-09-members.csv [sha256 9fc5704c1045] -> REFUSED batch 12: control count: the .ctl declares 5 rows, the file has 3 (truncated or padded file)
     rows: declared 5, received 3, rejected 0
   globex-2026-09-contributions.csv [sha256 59add450c029] -> REFUSED batch 14: 3 of 3 rows rejected, over the 50% threshold: nothing applied
     rows: declared 3, received 3, rejected 3
     reject line 2 [member] member M1001 is unknown for globex: send the members file first
     reject line 3 [member] member M1002 is unknown for globex: send the members file first
     reject line 4 [member] member M1003 is unknown for globex: send the members file first
   acme-2026-10-contributions.csv [sha256 a2e669c007ff] -> REFUSED batch 16: control total: the .ctl declares 1175.50, the amounts that parse add up to 1035.50 (1 amount(s) not a number: the total cannot be verified)
     rows: declared 6, received 6, rejected 1
     reject line 5 [amount_type] amount '14O.00' is not a number
     diff: new 5 ["M0001/2026-10","M0002/2026-10","M0003/2026-10","M0006/2026-10","M0007/2026-10"], changed 0, unchanged 0, missing 0 []
     control total: declared 1175.50, amounts that parse 1035.50 (accepted 1035.50 + rejected 0); 1 amount(s) not a number, counted on neither side
   rejects stored for the refused batches: batch 14: 3, batch 16: 1
```

Reconciliation, from every applied batch of the month (September is the first file plus the corrected one), and the batch log it is checked against:

```
   acme 2026-08: batch 2 inserted 6 = 6 rows, net 1500.75 = 1500.75; contributions has 6 rows / 1500.75 -> reconciled
   acme 2026-09: batch 5 + 8 inserted 5 + 1 = 6 rows, net 995.50 + 180.00 = 1175.50; contributions has 6 rows / 1175.50 -> reconciled
   every contribution: last_batch_id is an applied contributions batch of the same employer and month
   every applied batch: rows received = accepted + rejected

 id |             file_name             |    sha256    | status  | declared | received | accepted | rejected | inserted | updated | unchanged | missing | amount_declared | amount_accepted | amount_rejected | amount_net 
----+-----------------------------------+--------------+---------+----------+----------+----------+----------+----------+---------+-----------+---------+-----------------+-----------------+-----------------+------------
  1 | acme-2026-08-members.csv          | 9c01b120571a | applied |        6 |        6 |        6 |        0 |        6 |       0 |         0 |       0 |                 |                 |                 |           
  2 | acme-2026-08-contributions.csv    | 0e8f87ee05b7 | applied |        6 |        6 |        6 |        0 |        6 |       0 |         0 |       0 |         1500.75 |         1500.75 |            0.00 |    1500.75
  4 | acme-2026-09-members.csv          | c1f47ccd29c0 | applied |        6 |        6 |        5 |        1 |        1 |       1 |         3 |       1 |                 |                 |                 |           
  5 | acme-2026-09-contributions.csv    | add34e1f776c | applied |        8 |        8 |        5 |        3 |        5 |       0 |         0 |       0 |         1075.50 |          995.50 |           80.00 |     995.50
  8 | acme-2026-09-contributions-v2.csv | 80ebe2eca757 | applied |        6 |        6 |        6 |        0 |        1 |       0 |         5 |       0 |         1175.50 |         1175.50 |            0.00 |     180.00
 10 | initech-2026-09-contributions.csv | c932638267eb | refused |        1 |          |          |        0 |          |         |           |         |          150.00 |                 |                 |           
 12 | initech-2026-09-members.csv       | 9fc5704c1045 | refused |        5 |        3 |          |        0 |          |         |           |         |                 |                 |                 |           
 14 | globex-2026-09-contributions.csv  | 59add450c029 | refused |        3 |        3 |          |        3 |          |         |           |         |          985.00 |                 |                 |           
 16 | acme-2026-10-contributions.csv    | a2e669c007ff | refused |        6 |        6 |          |        1 |          |         |           |         |         1175.50 |                 |                 |           
(9 rows)
```

### Origins and further reading

- Book: *The Data Warehouse ETL Toolkit*, Ralph Kimball and Joe Caserta, 2004 (staging, data quality screens, error event tables, audit dimensions). https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/books/data-warehouse-dw-etl-toolkit/
- Docs: `COPY`, PostgreSQL 16 (`FORMAT csv`, `HEADER MATCH`). https://www.postgresql.org/docs/16/sql-copy.html
- Docs: `INSERT ... ON CONFLICT`, PostgreSQL 16. https://www.postgresql.org/docs/16/sql-insert.html#SQL-ON-CONFLICT
- Docs: `pg_input_is_valid` and `pg_input_error_info`, PostgreSQL 16. https://www.postgresql.org/docs/16/functions-info.html#FUNCTIONS-INFO-VALIDITY
- Docs: "Populating a Database", PostgreSQL 16 (why `COPY` beats row-by-row `INSERT`). https://www.postgresql.org/docs/16/populate.html
- Article: "Idempotence Is Not a Medical Condition", Pat Helland, ACM Queue, 2012. https://queue.acm.org/detail.cfm?id=2187821
- Docs: `pg-copy-streams`, the Node.js `COPY` stream used here. https://github.com/brianc/node-pg-copy-streams

---

## 28. Yearly statement campaign, a resumable batch job (`28-campaign/`)

**Pain: a yearly mail-out that sends twice to some members and never to others.** The first version is a loop: render a PDF, send it, next member. It crashes at member 7 and is run again, so members 1 to 7 get a second statement. A greylisted mailbox answers `451 try again later`, the loop logs it and moves on, and that member never gets one. Afterwards nobody can say who received what, or why someone did not.

**Reach for it when** one job performs the same side effect for many people (statements, notices, invoices, reminders, account migrations), it runs longer than a process can be trusted to stay up, and each person must get it once, with the exceptions listed and explained.

**Do not reach for it when** the email provider offers batch sends with an idempotency key per message and a queryable delivery log: then the job table only needs the key and the provider's message id. The volume calls for a queue (SQS, RabbitMQ, Kafka): the rules stay the same (one key per member and year, a dead-letter queue, backoff), but claiming moves out of Postgres. The messages are transactional and one at a time (a password reset): send them through an outbox (09).

A campaign table `statement_jobs` with one row per (year, member) and workers, each a separate process, that claim due rows with `FOR UPDATE SKIP LOCKED` and a lease, render a PDF statement with pdfkit, send it with nodemailer and record the outcome in the same row. The SMTP server is a sink built on the `smtp-server` package (port 52528) inside the demo process, with scripted faults: bob is greylisted twice, carol's mailbox is unknown (550), dan's server answers 451 every time.

### Concepts

- **The job table is the campaign**: `statement_jobs` has one row per member and year with a status (`pending`, `sending`, `retry`, `sent`, `dead`), the attempt count, the next attempt time, the lease, the last error and the hash of the PDF sent. Progress, resumption and the final report are queries on it; a process that dies loses nothing but the job it held.
- **Idempotency on member and year**: the primary key `(year, member_id)` makes creating the campaign idempotent (`ON CONFLICT DO NOTHING`, run twice: 16 then 0 jobs), and a job in `sent` is never claimed again, so restarting the batch, or a cron firing twice, sends nothing twice.
- **Claim with `FOR UPDATE SKIP LOCKED`**: `UPDATE ... FROM (SELECT ... WHERE due ... LIMIT 1 FOR UPDATE SKIP LOCKED)` picks one due job and marks it `sending` in one statement. Concurrent workers skip rows another worker holds instead of waiting on them, so they spread the work without coordination (worker B and C in the run).
- **Lease, not a long transaction**: the claim commits at once and sets `locked_until`; the SMTP call happens outside any transaction. A job whose worker died stays `sending` until the lease expires, then any worker may take it over. Every outcome is written `WHERE locked_by = me`, so a worker that was too slow and lost its lease cannot overwrite the new owner's result (the fencing idea of 19).
- **The in-doubt window**: SMTP accepted the message, then the worker died before recording it. No database can close that gap, because the send is not part of its transaction. The sample chooses at-least-once: the job is taken over and resent with the same `Message-ID` (`<statement-2025-M0007@portal.example>`), recorded as `in_doubt`, so the duplicate is countable and the receiving side can recognise it. For a payment instruction you would choose the other side: park the job for a person to check the mail log.
- **Retries with backoff and jitter**: a 4xx reply or a network error is transient; the job goes to `retry` with `next_attempt_at = now() + base * 2^(attempt-1) * random(0.5..1)`, up to 4 attempts. A 5xx reply is a final answer and goes straight to `dead`. Jitter keeps a batch of greylisted addresses from all coming back in the same instant.
- **Dead-letter list**: jobs that are `dead` keep their last error; the report lists them for a person to act on. Fixing the cause (carol's address) and requeueing that one job sends it without touching anything else.
- **Throttling**: each worker spaces its sends by `1000 / RATE` ms, measured from the start of each SMTP attempt; two workers at 5/s give 10/s in total, and the run checks that no 1-second window held more than 10 attempts. A global limit across any number of workers needs a shared counter (a token bucket row, or the provider's own rate limit answered with 4xx).
- **Dry run on a sample**: renders the PDFs of three members chosen by `md5(member_no || year)` (a stable sample, the same each run), writes them to `out/` and prints what would be sent, with no SMTP connection and no job touched. A person checks them before starting the batch.
- **Deterministic documents**: the PDF has a fixed creation date and uncompressed streams, so the same data gives the same bytes. The sha256 stored on the job identifies exactly what was sent, and matches the sample rendered in the dry run (carol's `706d110ececb`). The demo reads the text back from the PDF to check the total.
- **Campaign report**: per status and employer, first-try versus retried, in-doubt resends, and each dead letter with its reason: what the business asks the day after.
- **Trade-offs**: polling the table costs a query per idle worker every few hundred ms; `LISTEN/NOTIFY` or a queue removes that at scale. The lease must be longer than the slowest send, or a live worker loses its job and the work is done twice (fenced, so the current lease holder's outcome counts and the slow worker logs its lost lease and moves on, but the mail is sent twice). The in-doubt resend can still produce a duplicate; only the receiving side or the provider can remove it. Attachments mean personal data in transit and in mailboxes: many portals send a notification with a link to the statement behind the login instead.

### Proof (`logs/28-campaign.log`)

The naive loop: crashed at M0007, run again: four members got two statements, bob never got his (greylisted on both runs), carol and dan neither, and nothing records it (abridged):

```
   [naive] M0001 alice@acme.example: sent
   [naive] M0002 bob@acme.example: Can't send mail - all recipients were rejected: 451 4.7.1 greylisted, try again later (logged, skipped)
   [naive] M0003 carol@acme.example: Can't send mail - all recipients were rejected: 550 5.1.1 mailbox unknown (logged, skipped)
   [naive] M0004 dan@acme.example: Can't send mail - all recipients were rejected: 451 4.3.0 mailbox temporarily unavailable (logged, skipped)
   [naive] M0005 erin@acme.example: sent
   [naive] M0006 frank@acme.example: sent
   [naive] M0007 grace@globex.example: sent
   [naive] crash (SIGKILL)
   run 1 -> SIGKILL
   ...
   run 2 -> exit 0
   SMTP sink received 17 messages: alice x2, erin x2, frank x2, grace x2, heidi x1, ivan x1, judy x1, ken x1, lena x1, mike x1, nina x1, oscar x1, paula x1
```

The campaign is created once, and the dry run renders real PDFs without sending (text read back from one of them):

```
   enqueue 2025: 16 jobs created; again: 0
   would send to ken@globex.example: "Your 2025 annual statement", Message-ID <statement-2025-M0011@portal.example>, out/statement-2025-M0011.pdf (3065 bytes, sha256 87bf01be6256)
   would send to judy@globex.example: "Your 2025 annual statement", Message-ID <statement-2025-M0010@portal.example>, out/statement-2025-M0010.pdf (3074 bytes, sha256 2d23bfc4dd27)
   would send to carol@acme.example: "Your 2025 annual statement", Message-ID <statement-2025-M0003@portal.example>, out/statement-2025-M0003.pdf (3053 bytes, sha256 706d110ececb)
   text read back from out/statement-2025-M0011.pdf:
     | Annual statement 2025
     | Ken, member M0011, employer globex
     | Total contributions 2025: 4153.50
   rendering twice gives the same sha256; SMTP received 0 messages; jobs touched: 0
```

Worker A crashes after SMTP accepted M0007, before recording it; M0007 is left `sending` with A's lease:

```
   [worker A] started: 10 msg/s, lease 2000 ms, max 4 attempts, will crash after sending M0007
   [worker A] M0001 alice@acme.example   attempt 1: sent <statement-2025-M0001@portal.example>
   [worker A] M0002 bob@acme.example     attempt 1: 451 4.7.1 greylisted, try again later -> retry in 137 ms
   [worker A] M0003 carol@acme.example   attempt 1: 550 5.1.1 mailbox unknown -> dead letter (permanent)
   [worker A] M0004 dan@acme.example     attempt 1: 451 4.3.0 mailbox temporarily unavailable -> retry in 149 ms
   [worker A] M0005 erin@acme.example    attempt 1: sent <statement-2025-M0005@portal.example>
   [worker A] M0006 frank@acme.example   attempt 1: sent <statement-2025-M0006@portal.example>
   [worker A] M0007 grace@globex.example attempt 1: 250 accepted by SMTP, now crashing (SIGKILL) before recording it
   worker A -> SIGKILL
   dead      1  M0003
   pending   9  M0008,M0009,M0010,M0011,M0012,M0013,M0014,M0015,M0016
   retry     2  M0002,M0004
   sending   1  M0007
   sent      3  M0001,M0005,M0006
   in doubt: [{"member_no":"M0007","locked_by":"A","lease_live":true}]
```

Two workers resume in parallel: nothing already sent is sent again, M0007 is taken over once the lease expires and resent with the same Message-ID, bob gets his after two 451s, dan becomes a dead letter after 4 attempts, and the throttle holds:

```
   [worker B] started: 5 msg/s, lease 2000 ms, max 4 attempts
   [worker C] started: 5 msg/s, lease 2000 ms, max 4 attempts
   [worker B] M0008 heidi@globex.example attempt 1: sent <statement-2025-M0008@portal.example>
   [worker C] M0009 ivan@globex.example  attempt 1: sent <statement-2025-M0009@portal.example>
   [worker B] M0010 judy@globex.example  attempt 1: sent <statement-2025-M0010@portal.example>
   [worker C] M0011 ken@globex.example   attempt 1: sent <statement-2025-M0011@portal.example>
   [worker B] M0012 lena@initech.example attempt 1: sent <statement-2025-M0012@portal.example>
   [worker C] M0013 mike@initech.example attempt 1: sent <statement-2025-M0013@portal.example>
   [worker B] M0014 nina@initech.example attempt 1: sent <statement-2025-M0014@portal.example>
   [worker C] M0015 oscar@initech.example attempt 1: sent <statement-2025-M0015@portal.example>
   [worker C] M0002 bob@acme.example     attempt 2: 451 4.7.1 greylisted, try again later -> retry in 409 ms
   [worker B] M0016 paula@initech.example attempt 1: sent <statement-2025-M0016@portal.example>
   [worker B] M0007 attempt 1 by worker A has no outcome (lease expired): the mail may or may not have gone; resending with the same Message-ID
   [worker C] M0004 dan@acme.example     attempt 2: 451 4.3.0 mailbox temporarily unavailable -> retry in 446 ms
   [worker B] M0007 grace@globex.example attempt 2: sent <statement-2025-M0007@portal.example>
   [worker B] M0002 bob@acme.example     attempt 3: sent <statement-2025-M0002@portal.example>
   [worker B] M0004 dan@acme.example     attempt 3: 451 4.3.0 mailbox temporarily unavailable -> retry in 756 ms
   [worker C] M0004 dan@acme.example     attempt 4: 451 4.3.0 mailbox temporarily unavailable -> dead letter (4 attempts used)
   [worker C] done: 4 sent, 2 retries scheduled, 1 dead letters
   [worker B] done: 7 sent, 1 retries scheduled, 0 dead letters
   workers B -> exit 0, C -> exit 0
   SMTP sink received 15 messages: alice x1, erin x1, frank x1, grace x2, heidi x1, ivan x1, judy x1, ken x1, lena x1, mike x1, nina x1, oscar x1, paula x1, bob x1
   grace: 2 copies, Message-IDs ["<statement-2025-M0007@portal.example>"]
   busiest 1-second window of SMTP attempts while resuming: 10 (limit 10/s); messages received before the resume: 4
```

The dead letters, carol's fixed and requeued, a rerun that sends nothing, and the final report:

```
     dead letters 2:
       M0003 carol@acme.example after 1 attempt(s): 550 5.1.1 mailbox unknown
       M0004 dan@acme.example after 4 attempt(s): 451 4.3.0 mailbox temporarily unavailable
   support corrects carol's address to carol.petit@acme.example and requeues her job
   [worker D] M0003 carol.petit@acme.example attempt 1: sent <statement-2025-M0003@portal.example>
   campaign 2025 report
     dead     1
     sent     15
     acme     5/6 sent
     globex   5/5 sent
     initech  5/5 sent
     sent on the first attempt 13, after retries 2; SMTP attempts 22; in-doubt resends 1
     dead letters 1:
       M0004 dan@acme.example after 4 attempt(s): 451 4.3.0 mailbox temporarily unavailable
```

Every attempt, by worker, for the members with a story (from the `statement_attempts` proof table):

```
 id | member_no | attempt | worker | outcome  |                                                           detail                                                            
----+-----------+---------+--------+----------+-----------------------------------------------------------------------------------------------------------------------------
  2 | M0002     |       1 | A      | retry    | 451 4.7.1 greylisted, try again later
 15 | M0002     |       2 | C      | retry    | 451 4.7.1 greylisted, try again later
 20 | M0002     |       3 | B      | sent     | 250 OK: message queued
  3 | M0003     |       1 | A      | dead     | 550 5.1.1 mailbox unknown
 23 | M0003     |       1 | D      | sent     | 250 OK: message queued
  4 | M0004     |       1 | A      | retry    | 451 4.3.0 mailbox temporarily unavailable
 18 | M0004     |       2 | C      | retry    | 451 4.3.0 mailbox temporarily unavailable
 21 | M0004     |       3 | B      | retry    | 451 4.3.0 mailbox temporarily unavailable
 22 | M0004     |       4 | C      | dead     | 451 4.3.0 mailbox temporarily unavailable
 17 | M0007     |       1 | B      | in_doubt | attempt 1 by worker A has no outcome (lease expired): the mail may or may not have gone; resending with the same Message-ID
 19 | M0007     |       2 | B      | sent     | 250 OK: message queued
```

### Origins and further reading

- Docs: `SELECT ... FOR UPDATE SKIP LOCKED`, PostgreSQL 16 ("The Locking Clause"). https://www.postgresql.org/docs/16/sql-select.html#SQL-FOR-UPDATE-SHARE
- Article: "What is SKIP LOCKED for in PostgreSQL 9.5?", Craig Ringer, 2016. https://www.2ndquadrant.com/en/blog/what-is-select-skip-locked-for-in-postgresql-9-5/
- Article: "Exponential Backoff And Jitter", Marc Brooker, AWS Architecture Blog, 2015. https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- Book: *Enterprise Integration Patterns*, Gregor Hohpe and Bobby Woolf, 2003 (Dead Letter Channel, Idempotent Receiver). https://www.enterpriseintegrationpatterns.com/patterns/messaging/DeadLetterChannel.html
- RFC: 5321 "Simple Mail Transfer Protocol" (4xx transient and 5xx permanent replies, retry strategy in section 4.5.4). https://www.rfc-editor.org/rfc/rfc5321
- RFC: 5322 "Internet Message Format" (`Message-ID`, section 3.6.4). https://www.rfc-editor.org/rfc/rfc5322
- Article: "How to do distributed locking", Martin Kleppmann, 2016 (leases and fencing tokens). https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
- Docs: PDFKit, the PDF generator used here. https://pdfkit.org/
- Docs: Nodemailer and its `smtp-server` package, the sender and the sink used here. https://nodemailer.com/extras/smtp-server/

---

## 29. Product and service KPIs (`29-kpis/`)

**Pain: numbers that look good while members fail.** "712 logins this month" says nothing about the 58 eligible members who never came. A mean latency of 51 ms hides the long-serving members who wait 356 ms for their contribution history. A health check answers 200 all through an outage that failed member requests for four hours. Each team counts "active" or "resolved" its own way, nobody owns the number, and nobody knows what it should be.

**Reach for it when** a service needs to show whether it is used, whether members get their task done, and whether it is reliable enough: a product review, a service level agreed with partner organisations, a monthly report to whoever funds the team.

**Do not reach for it when** you need live alerting: page on burn rate from a metrics system (Prometheus, OpenTelemetry metrics), not from SQL run once a month. You have millions of events a day: send them to an analytics store (a warehouse, ClickHouse) rather than the transactional database. A product analytics tool already captures the funnel: keep the definitions file and point its SQL at the tool's export.

A member portal (node:http, a separate process) writes a usage event per member action into `events` and a row per HTTP request into `request_log`. A simulator drives 28 days of seeded traffic through it on a simulated clock: 120 members of Acme, Globex and Initech, hourly health probes, change requests with validation errors and abandonment, staff resolving the requests, and a four-hour database incident. Every KPI is defined once in `src/kpis.ts`; the report runs those definitions, prints the table and writes a static HTML dashboard.

### Concepts

- **Two event streams**: usage events (`login`, `view_profile`, `change_started`, `change_submitted`, `change_rejected`) say what members did, in product terms; `request_log` (route template, status, duration) says what the service did. Product KPIs read the first, service KPIs the second. Both are written by the app itself, so a KPI is a query, not a spreadsheet someone fills in.
- **KPI definition**: each entry in `kpis.ts` has the question it answers, a formula in words, a unit, a target with a direction, an owner, and the SQL that computes it over a window (`$1` inclusive, `$2` exclusive). The report, the dashboard and the checks all read the same list, so "adoption" cannot mean two things. `validate()` rejects a definition with no question, owner or target before its number reaches a dashboard.
- **Vanity metric versus adoption**: a raw count (logins, page views) only grows with traffic and has no denominator. Adoption divides distinct eligible members who logged in by all eligible members; the base excludes members who left the scheme. Broken down by employer, it shows where to act (Initech at 22%).
- **Task success and completion time**: a task is a session that opened the change form; it succeeded if the same session submitted a valid request. Completion time is first submit minus first open, reported as a median with the p90 beside it, because times are skewed.
- **Funnel**: sessions reaching each step (login, profile, form opened, submitted). The drop between two steps locates the problem; the form error rate (422s over submissions) explains part of the last drop.
- **Percentiles, not means**: the mean blends many fast requests with a few slow ones. The p95 is what one request in twenty waits. Over all routes together the fast pages still drown the slow one, so the latency KPI takes the p95 of the slowest member route.
- **Availability, SLO and error budget**: availability is member requests answered without a 5xx over all member requests, measured where members are, not by a probe on `/health` that never touches the database. The SLO (99.5%) is the target; the error budget is what it allows, `(1 - SLO) x requests` failed requests (10.5 here). The burn rate is the error rate divided by the budget rate: 28x over the day of the incident (11 of 78 member requests failed) and about 85x during its four hours (11 of 26), which spent the month's budget in one morning. A spent budget is the agreed signal to put reliability work before features.
- **SLA**: an agreement with the partner organisations, here "change requests resolved within 3 days". It is measured on requests whose deadline fell in the window; a request still open past its deadline counts as missed.
- **Static dashboard**: one HTML file, no script and no external library, so it can be mailed, archived or attached to a report. Tiles show the value, the target, met or missed as text with an icon (not colour alone), the detail behind the ratio and the owner; inline SVG bars carry `<title>` tooltips; the definitions table sits under the charts.
- **Trade-offs**: KPIs computed from the transactional database compete with members' queries and only cover what the app emits; a missing event is a silent zero. Simulated time makes the run reproducible; in production `at` is `now()` and the window is a calendar month. A target is a negotiated number: set it from a baseline, revisit it, and never let a KPI become the goal itself (Goodhart's law).

### Proof (`logs/29-kpis.log`)

The app emitted 712 logins, but only 52 of 110 eligible members logged in at all:

```
   logins in the window: 712 (sounds like success)
   adoption: 47.3% (52 of 110 eligible members), target >= 60%
   Acme     25/55 eligible members active (45%)
   Globex   23/37 eligible members active (62%)
   Initech  4/18 eligible members active (22%)
```

The contributions page has a 51 ms mean and a 356 ms p95; all routes together have a p95 of 20 ms, which is why the KPI takes the slowest route:

```
   GET /contributions       397 requests  mean   51 ms  p95  356 ms
   GET /profile             639 requests  mean    6 ms  p95   17 ms
   POST /changes            179 requests  mean    7 ms  p95   16 ms
   all member routes together: mean 14 ms, p95 20 ms (the fast pages drown the slow one, so the KPI takes the slowest route)
```

The health probe saw no outage; member requests did, and the incident spent the whole error budget, burning it 28x faster than allowed over the day and about 85x during the four hours:

```
   health probes: 672, 100.0% answered 200
   availability:  99.48% (11 of 2102 requests failed), SLO 99.5%
   error budget:  11 failed of 10.5 allowed, remaining -5%
   09-17: 11 of 78 member requests failed (burn rate 28.2x the budget rate over the day)
     09:00: 0 of 2 failed (burn rate 0.0x)
     10:00: 3 of 8 failed (burn rate 75.0x)
     11:00: 5 of 11 failed (burn rate 90.9x)
     12:00: 3 of 5 failed (burn rate 120.0x)
   incident 09:00-13:00 (4 hours): 11 of 26 member requests failed (burn rate 84.6x the budget rate)

          hour          | probes | probes_ok | member_requests | failed
------------------------+--------+-----------+-----------------+--------
 2026-09-17 10:00:00+00 |      1 |         1 |               8 |      3
 2026-09-17 11:00:00+00 |      1 |         1 |              11 |      5
 2026-09-17 12:00:00+00 |      1 |         1 |               5 |      3
```

The funnel, and a draft KPI rejected because nobody owns it and it has no target:

```
   login                712
   view_profile         639 (-10% from login)
   change_started       175 (-73% from view_profile)
   change_submitted     149 (-15% from change_started)
   23 sessions hit a validation error at least once

   rejected: logins: no question
   rejected: logins: no owner
   rejected: logins: no target
```

The report, every row from a definition's SQL:

```
   KPI                                           value  target     status  owner          detail
   Adoption                                      47.3%  >= 60.0%   MISSED  product owner  52 of 110 eligible members
   Change request task success                   85.1%  >= 85.0%   met     product owner  149 of 175 tasks
   Change request completion time (median)       169 s  <= 240 s   met     UX lead        p90 398 s
   Form error rate                               13.4%  <= 10.0%   MISSED  UX lead        23 of 172 submissions
   Latency p95, slowest route                   356 ms  <= 300 ms  MISSED  tech lead      GET /contributions, all routes together 20 ms
   Availability                                 99.48%  >= 99.50%  MISSED  service owner  11 of 2102 requests failed
   Error budget remaining                        -4.7%  >= 0.0%    MISSED  service owner  11 failed of 10.5 allowed
   Requests resolved within 3 days               86.9%  >= 90.0%   MISSED  support lead   113 of 130 due
```

### Origins and further reading

- Book: *Site Reliability Engineering*, Beyer, Jones, Petoff, Murphy (eds.), 2016, chapter 4 "Service Level Objectives". https://sre.google/sre-book/service-level-objectives/
- Book: *The Site Reliability Workbook*, Beyer et al. (eds.), 2018, chapters "Implementing SLOs" and "Alerting on SLOs" (burn rate). https://sre.google/workbook/implementing-slos/
- Article: "Measuring the User Experience on a Large Scale: User-Centered Metrics for Web Applications" (the HEART framework), Rodden, Hutchinson, Fu, 2010. https://doi.org/10.1145/1753326.1753687
- Docs: "Measuring the success of your service", GOV.UK Service Manual (cost per transaction, user satisfaction, completion rate, digital take-up). https://www.gov.uk/service-manual/measuring-success
- Book: *Lean Analytics*, Alistair Croll and Benjamin Yoskovitz, 2013 (vanity metrics, one metric that matters).
- Article: "Improving ratings: audit in the British University system", Marilyn Strathern, 1997 (the general form of Goodhart's law: "when a measure becomes a target, it ceases to be a good measure").

---

## 30. CI/CD pipeline with scheduled releases (`30-pipeline/`)

**Pain: checks that only run when someone remembers, and releases that happen whenever someone pushes.** A lint error, a type error or an inaccessible page reaches the main branch because nobody ran the checks locally. A deploy goes out from a laptop on a Friday evening, nobody can say which commit is live, and a vulnerable dependency ships because the audit was "only a warning".

**Reach for it when** more than one person changes the code, or the same person ships more than once: every change goes through the same lint, type, test, accessibility and audit gates, and production only changes on an agreed schedule or a release tag.

**Do not reach for it when** the project is a throwaway script. You deploy many times a day behind feature flags: deploy every green main build (continuous deployment) instead of waiting for a schedule. The jobs need services (Postgres, a browser): use a runner with the Docker executor and `services:`, which `gitlab-ci-local` also runs.

A tiny TypeScript app (an annual statement page) with a `.gitlab-ci.yml`: stages lint (eslint), typecheck (tsc), test (vitest with a JUnit report, and axe-core on the rendered page), audit (npm audit), build, and a deploy that only exists in scheduled or tagged pipelines. `gitlab-ci-local` runs the file on this machine with the shell executor, each job in its own copy of the project, no container images. `github-actions/ci.yml` is the same pipeline for GitHub Actions, kept outside `.github/` so it does not run; a script parses both files and checks that each job runs the same commands in the same order on the same kind of runner, and that both deploy on exactly the same triggers.

### Concepts

- **Pipeline as code**: the pipeline is a file in the repository, reviewed and versioned with the code it checks. `gitlab-ci-local` runs that same file locally, so a pipeline change can be tried before it is pushed.
- **Stages and fail fast**: jobs in a stage run in parallel (`unit` and `a11y`), stages run in order, and a failed job stops the later stages. The cheap checks go first: a lint error fails in under 10 s instead of after the build. The order also documents intent: tsc accepts `age: any` and `==`, eslint does not.
- **Rules decide which jobs exist**: `workflow: rules` decides whether a pipeline runs at all (no duplicate branch pipeline when a merge request is open); job `rules` decide which jobs it has. A push gets every check and the build; a pipeline started by a schedule, or by a tag matching `vX.Y.Z`, also gets `deploy`. `rc-1` is a tag but not a release, so it has no deploy.
- **Scheduled releases**: a pipeline schedule (a cron in GitLab, here Tuesdays 06:00) starts a pipeline with `CI_PIPELINE_SOURCE=schedule`. Production changes in a known window that partner organisations can be told about, from whatever is on the main branch then, with every gate re-run on that exact commit.
- **A gate that only blocks releases**: the audit is `allow_failure: true` on pushes, so an advisory published overnight does not block unrelated work, and `allow_failure: false` on schedules and tags, so a known high-severity vulnerability never ships.
- **Cache versus artifacts**: the cache (`.npm/`, keyed on the hash of `package-lock.json`) is a speed-up that may be missing: every job still runs `npm ci`, which only reads it. Artifacts are outputs a later job or a person needs and must be there: `reports/junit.xml` (GitLab shows test results in the merge request), `reports/a11y.json`, and `dist/`, which `deploy` downloads from `build` (`needs: [build]`) instead of rebuilding, so what was tested is what ships.
- **Job isolation**: with `--shell-isolation` each job runs in its own copy of the project, as on a real runner, so one job cannot pass by reusing another job's `node_modules` or leftover files.
- **Deploy job**: `environment: production` records each deployment in GitLab's environment history; `resource_group: production` lets only one deploy run at a time; `interruptible: false` keeps a newer pipeline from cancelling it halfway. The job runs on a runner on the production host (`tags: [production]`), since it writes there. The release goes into its own directory and is smoke-tested there (its page renders) before anything points at it; only then is a symlink renamed over `current`, an atomic switch: a reader sees the old release or the new one, never half of each. A failed smoke test stops the job with `current` still on the previous release. The previous release stays on disk, so rolling back is pointing `current` back (31 does it with a runbook).
- **GitHub Actions equivalent**: stages become `needs:` between jobs, `rules` become `if:` and `on:` triggers (`schedule: cron`, tags), `resource_group` becomes `concurrency`, `allow_failure` becomes `continue-on-error`, artifacts go through `upload-artifact`/`download-artifact`, and `setup-node` caches npm. Runner tags become `runs-on` labels: the checks run on `ubuntu-latest`, a fresh VM thrown away after each job, so the deploy runs on `[self-hosted, production]`, a runner installed on the production host. GitLab's tag rule `/^v\d+\.\d+\.\d+$/` becomes a push filter `v[0-9]+.[0-9]+.[0-9]+` (filter patterns are globs, not regexes) and a first deploy step that checks the exact regex, so `v1.4.0-rc1` never deploys. `scripts/compare.ts` reads both files and compares, per job, the commands in order (including `release.json`, the smoke test and its target), the runner, and whether each trigger (schedule, a push to main, tags `v1.4.0`, `v1.4.0-rc1`, `v1.4`, `rc-1`) deploys; run on a drifted copy, it names each difference.
- **Trade-offs**: every job reinstalls dependencies (correct and isolated, but it is most of the run time; a job image with dependencies baked in is faster). The accessibility check runs axe in jsdom, which has no layout, so contrast and focus are not covered: run axe in a browser (21) for those. A scheduled release batches a week of changes, so a failure has more suspects than with continuous deployment. `gitlab-ci-local` imitates GitLab closely but not exactly (protected variables, runner tags and environments' approvals only exist on the server).

### Proof (`logs/30-pipeline.log`)

The jobs a pipeline gets depend on what started it:

```
   lint       stage lint       allow_failure false
   typecheck  stage typecheck  allow_failure false
   unit       stage test       allow_failure false
   a11y       stage test       allow_failure false
   audit      stage audit      allow_failure true
   build      stage build      allow_failure false

   schedule    jobs: lint, typecheck, unit, a11y, audit, build, deploy; audit allow_failure false
   tag v1.4.0  jobs: lint, typecheck, unit, a11y, audit, build, deploy; audit allow_failure false
   tag rc-1    jobs: lint, typecheck, unit, a11y, audit, build; audit allow_failure false
```

A function that type-checks but breaks three lint rules, appended to `src/statement.ts` (gitlab-ci-local, like a runner, only sees tracked files), stops the pipeline at its first stage; no later job starts:

```
   lint      $ npm run lint
   lint      > .gitlab-ci-local/builds/lint/src/statement.ts
   lint      >   11:30  error  Unexpected any. Specify a different type     @typescript-eslint/no-explicit-any
   lint      >   12:9   error  'unused' is assigned a value but never used  @typescript-eslint/no-unused-vars
   lint      >   13:14  error  Expected '===' and instead saw '=='          eqeqeq
   lint      > ✖ 3 problems (3 errors, 0 warnings)
    FAIL  lint
   lint      finished in 6.6 s  FAIL 1
   pipeline finished in 7.14 s
```

Without the function, the same pipeline passes; from the second job on, each restores the npm cache the previous jobs saved:

```
   typecheck imported cache '0_package-lock-19dce0d6a8dcbaaba9ae788ddfc8a76f1c7ad8d4' in 471 ms
    PASS  lint
    PASS  typecheck
    PASS  unit
    PASS  a11y
    PASS  audit
    PASS  build
   pipeline finished in 33 s
```

A scheduled pipeline, then a release tag, each deploy into their own directory, smoke-tested there before `current` is switched to it; `current` points at the last one and the previous one is kept:

```
   deploy    $ mkdir -p "$DEPLOY_DIR/releases/$RELEASE"
   deploy    $ cp -r dist/. "$DEPLOY_DIR/releases/$RELEASE/"
   deploy    $ echo '{"type":"module"}' > "$DEPLOY_DIR/releases/$RELEASE/package.json"
   deploy    $ printf '{"release":"%s","commit":"%s","source":"%s"}\n' "$RELEASE" "$CI_COMMIT_SHA" "$CI_PIPELINE_SOURCE" > "$DEPLOY_DIR/releases/$RELEASE/release.json"
   deploy    $ node -e "import('$DEPLOY_DIR/releases/$RELEASE/page.js').then((m) => { if (!m.statementPage('smoke', 2026, []).includes('<html lang=\"en\">')) process.exit(1); console.log('smoke ok') })"
   deploy    > smoke ok
   deploy    $ ln -sfn "releases/$RELEASE" "$DEPLOY_DIR/current.tmp" && mv -T "$DEPLOY_DIR/current.tmp" "$DEPLOY_DIR/current"
   deploy    $ echo "deployed $RELEASE to $DEPLOY_DIR/current"
   deploy    > deployed scheduled-c0c37da4-1002 to .deploy/current
   .deploy/current -> releases/scheduled-c0c37da4-1002
   current -> releases/v1.4.0, release.json {"release":"v1.4.0","commit":"c0c37da4c4b5b22752072cda0e1c87f115fa5c10","source":"push"}; previous releases/scheduled-c0c37da4-1002 still on disk: true

.deploy/releases/scheduled-c0c37da4-1002: {"release":"scheduled-c0c37da4-1002","commit":"c0c37da4c4b5b22752072cda0e1c87f115fa5c10","source":"schedule"}
.deploy/releases/v1.4.0: {"release":"v1.4.0","commit":"c0c37da4c4b5b22752072cda0e1c87f115fa5c10","source":"push"}
```

Both pipeline files run the same commands in the same order, on the same kind of runner, and deploy on the same triggers; a drifted copy of the GitHub file is caught:

```
   job        gitlab stage  github needs  runner      commands
   lint       lint                        any         npm run lint
   typecheck  typecheck     lint          any         npm run typecheck
   unit       test          typecheck     any         npx vitest run
   a11y       test          typecheck     any         npm run a11y
   audit      audit         unit, a11y    any         npm run audit
   build      build         audit         any         npm run build
   deploy     deploy        build         production  mkdir, cp dist, package.json, release.json, smoke releases/$RELEASE, ln -sfn, mv -T
   deploys on: schedule yes; push main no; tag v1.4.0 yes; tag v1.4.0-rc1 no; tag v1.4 no; tag rc-1 no
   the comparison on a drifted copy (smoke test after the switch, release.json dropped, deploy on ubuntu-latest, a loose tag filter and tag check):
   job        gitlab stage  github needs  runner      commands
   deploy     deploy        build         production vs any DIFFERENT: mkdir, cp dist, package.json, release.json, smoke releases/$RELEASE, ln -sfn, mv -T vs mkdir, cp dist, package.json, ln -sfn, mv -T, smoke current
   deploys on: schedule yes; push main no; tag v1.4.0 yes; tag v1.4.0-rc1 DIFFERENT (gitlab no, github yes); tag v1.4 no; tag rc-1 no
```

### Origins and further reading

- Book: *Continuous Delivery*, Jez Humble and David Farley, 2010 (the deployment pipeline, build once and promote the same artifact).
- Article: "Continuous Integration", Martin Fowler, 2006, revised 2024. https://martinfowler.com/articles/continuousIntegration.html
- Book: *Accelerate*, Nicole Forsgren, Jez Humble, Gene Kim, 2018 (deployment frequency, lead time, change failure rate, time to restore).
- Docs: GitLab CI/CD YAML syntax reference (`rules`, `workflow`, `cache`, `artifacts`, `needs`, `environment`, `resource_group`). https://docs.gitlab.com/ci/yaml/
- Docs: GitLab scheduled pipelines. https://docs.gitlab.com/ci/pipelines/schedules/
- Docs: GitHub Actions workflow syntax. https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- Tool: gitlab-ci-local, Mads Jon Nielsen. https://github.com/firecow/gitlab-ci-local

---

## 31. Executable runbooks, ADRs and docs-lint (`31-runbook/`)

**Pain: operations that live in one person's head.** The release goes fine when the person who always does it is in; when they are away, the backup is skipped, the migration runs after the restart, and nobody knows how to go back. The wiki page for the monthly data load drifted from what people actually type. A new team member cannot tell a deliberate decision from an accident, so they undo it or are afraid to touch it.

**Reach for it when** a small team runs a service: releases, data loads, member requests and rollbacks are repeated by different people, some steps need a human, and every run should leave a record.

**Do not reach for it when** the procedure is fully automated and runs on every change: put it in the pipeline (30) or a deploy tool, and keep a runbook only for what happens when that fails. You need incident response at scale (paging, escalation, status pages): use an incident tool and link the runbooks from its alerts. A step is long or tricky: write it as a tested script in `ops/` and call it from the runbook.

Four runbooks in Markdown (scheduled release, rollback, monthly data update, a member's change request), each with Preconditions, Steps, Verification and Rollback. A runner parses them, runs each fenced `sh` block, asks the operator at each `manual` block, stops at the first failure, prints the Rollback section and can run it, and records every run and step in Postgres. The release migrates the schema, restarts a member service (node:http) and smoke-tests it; v3 ships a bug, the smoke test catches it, and the release runs the rollback runbook. Three ADRs, an onboarding checklist and a docs-lint complete the set.

### Concepts

- **Runbook**: a written procedure for a recurring operational task, with an owner and parameters. The four sections answer the operator's questions in order: may I start (Preconditions), what do I do (Steps), did it work (Verification), how do I undo it (Rollback).
- **Executable documentation**: steps are fenced `sh` blocks in the Markdown, so the document a person reads and the commands the runner executes are the same text and cannot drift apart. Parameters (`--set VERSION=v3`) become environment variables; each block runs under `bash -euo pipefail`, so any failing command fails the step.
- **Manual steps and do-nothing scripting**: a `manual` block is a step only a person can do (call the member back to verify their identity). The runner shows it and waits for a confirmation, from a terminal or `--yes`; with no operator it stops there and nothing after it runs. Manual steps stay visible in the same flow and are automated one at a time, which is how a procedure moves from a document to a script without a big rewrite.
- **Preconditions guard, rollback undoes**: a failed precondition means nothing changed (exit 2, no rollback needed): the second load of the same file stops at "not loaded before" because its sha256 is already in `import_batches`, and a corrected file for a period already loaded stops at "no batch for this period yet": replacing a verified load is a deliberate rollback of that batch first, never a side effect. A failed step or verification stops the runbook, prints its Rollback section, and with `--rollback auto` runs it. Verification and rollback are scoped to the batch (found by the file's sha256), so a rollback never deletes rows another load put there.
- **One rollback procedure**: the release's Rollback section calls `runbooks/rollback.md` through the runner, so the automatic rollback and the one an engineer runs by hand the next morning are the same tested procedure, recorded as a child run (`parent` in `ops.runs`).
- **Release steps in a safe order**: record the running release (so rollback knows where to return), back up, migrate (additive, expand/contract as in 02, so the old version keeps working on the new schema), restart, smoke-test the few requests that prove members are served, and only then record the new release. Each migration has a `.down.sql` that removes exactly what its `.up.sql` added.
- **Run log**: `ops.runs` and `ops.steps` keep who ran what, with which parameters, how each step ended and the tail of its output: an audit trail of operations, and the place to look first after an incident.
- **ADR (Architecture Decision Record)**: a short numbered file per decision that is expensive to reverse, in Michael Nygard's format: title, date, status, context, decision, consequences. Records are not edited once accepted; a new one supersedes the old, whose status links to it.
- **Onboarding checklist**: what a new team member reads and does in the first two weeks, linked to the ADRs and runbooks, ending with running each runbook under supervision and improving one.
- **docs-lint**: documentation is checked like code. Every runbook needs an owner, a parameters line, the four sections in order, and steps that each hold an `sh` or `manual` block, with no block between a section heading and its first step (the runner would never run it); every ADR needs a number matching its file name, a date, a status from a fixed list (a "Superseded by" must link to an existing record) and the three other sections; relative links must resolve. Run it in the pipeline (30).
- **Trade-offs**: shell in Markdown is harder to test than a script, so long logic belongs in `ops/`. Parameters never become SQL text: each SQL block is a quoted heredoc (`<<'SQL'`, so bash expands nothing in it) and gets its values as `psql -v` variables, read as `:'email'` (quoted by psql) or `:'id'::int` (anything but a number fails), so `bob.o'brien@example.org` is stored as typed. `psql -c` does not expand variables, which is why those statements go through stdin. Down migrations drop columns, so data written to them since the release is lost on rollback; past that point, restore the backup instead (the rollback runbook says so). The run log lives in the database it operates on; in production keep it elsewhere, or a failed restore also loses its record.

### Proof (`logs/31-runbook.log`)

docs-lint rejects a runbook with missing sections and a block outside any step, and an ADR without a status, and passes the real documents:

```
   fixtures/broken-docs/runbooks/restore-backup.md: no 'Parameters:' line (write 'Parameters: none')
   fixtures/broken-docs/runbooks/restore-backup.md: no '## Preconditions' section
   fixtures/broken-docs/runbooks/restore-backup.md: '## Verification' has no '### step'
   fixtures/broken-docs/runbooks/restore-backup.md: '## Verification' has a sh block outside any '### step' (it never runs)
   fixtures/broken-docs/runbooks/restore-backup.md: no '## Rollback' section
   fixtures/broken-docs/docs/adr/0004-use-a-message-queue.md: no '# N. Title' heading
   fixtures/broken-docs/docs/adr/0004-use-a-message-queue.md: no 'Date: YYYY-MM-DD' line
   fixtures/broken-docs/docs/adr/0004-use-a-message-queue.md: no '## Status' section
   fixtures/broken-docs/docs/adr/0004-use-a-message-queue.md: no '## Consequences' section
   fixtures/broken-docs/docs/onboarding.md: missing: every team needs an onboarding checklist
```

Release v3 migrates and restarts, the smoke test gets a 500, and the rollback runbook brings back v2 and schema 2 (abridged):

```
    3. Migrate the schema
      | migrate up 003_statement_preference
      | schema version 3
      [ok] 1.1s
    4. Restart the service on the new version
      | stopped pid 6495
      | started v3 (pid 10592)
      [ok] 1.9s
    5. Smoke test
      | GET /health -> {"status":"ok","version":"v3"}
      | GET /members/1 -> {"error":"column \"statement_pref\" does not exist"} 500
      | member page is broken
      [FAILED (exit 1)] 0.1s
  stopped at "5. Smoke test". Rollback (runbooks/scheduled-release.md):
    1. Roll back to the recorded release
      $ npx tsx src/runner.ts runbooks/rollback.md --operator "$RUNBOOK_OPERATOR" --parent "$RUNBOOK_RUN_ID"
  rollback
    1. Roll back to the recorded release
      | runbook #10: Roll back a release (runbooks/rollback.md), operator alice
      |     2. Migrate the schema down to the previous release
      |       | migrate down 003_statement_preference
      |       | schema version 2
      |       | GET /health -> {"status":"ok","version":"v2"}
      |       | GET /members/1 -> {"id":1,"name":"alice","email":"alice@new.example","preferred_name":null} 200
      | runbook #10: succeeded
      [ok] 4.6s
runbook #9: failed, rolled back
```

The same file a second time, then a corrected file for the same period: a precondition stops each run before anything changes, and the verified load stays as it was (abridged):

```
    1. The file is there and has not been loaded before
      | sha256 92e7a1ad1c61, batches already loaded from this file: 1
      [FAILED (exit 1)] 0.3s
runbook #4: precondition failed: nothing was changed
runbook #5: Monthly data update (runbooks/monthly-data-update.md) FILE=data/contributions-2026-09-corrected.csv PERIOD=2026-09, operator alice
    3. No batch is loaded for this period yet
      | already loaded for 2026-09: batch 1 from data/contributions-2026-09.csv
      [FAILED (exit 1)] 0.3s
runbook #5: precondition failed: nothing was changed
   => exit 2
   contributions: 3 rows, total 1102.75, 1 batch
```

Without an operator, the member request stops at its first manual step and prints its rollback; nothing ran after it:

```
    1. Verify the member's identity
      | MANUAL: Call the member back on the phone number their employer holds (not the one in the email) and confirm the request.
      [not confirmed] 0.0s
  stopped at "1. Verify the member's identity". Rollback (runbooks/user-request.md):
runbook #6: failed, rollback printed for the operator
```

Parameters reach SQL as psql variables, so a quote in an address is data: the verification reads it back and the audit row has it as typed:

```
      | stored bob.o'brien@example.org, changes on SUP-1043: 1
   member 2: {"email":"bob.o'brien@example.org","old_value":"bob@example.org","new_value":"bob.o'brien@example.org"}
```

Every run is recorded; the second load of the same file and the corrected file were stopped by a precondition, and run 10 is the rollback run 9 started:

```
 id |             runbook             |                                      params                                      | operator | parent |                  outcome                  | seconds
----+---------------------------------+----------------------------------------------------------------------------------+----------+--------+-------------------------------------------+---------
  1 | runbooks/scheduled-release.md   | {"VERSION": "v1", "MIGRATION": "1"}                                              | alice    |        | succeeded                                 |     2.6
  2 | runbooks/scheduled-release.md   | {"VERSION": "v2", "MIGRATION": "2"}                                              | alice    |        | succeeded                                 |     5.4
  3 | runbooks/monthly-data-update.md | {"FILE": "data/contributions-2026-09.csv", "PERIOD": "2026-09"}                  | alice    |        | succeeded                                 |     2.2
  4 | runbooks/monthly-data-update.md | {"FILE": "data/contributions-2026-09.csv", "PERIOD": "2026-09"}                  | alice    |        | precondition failed: nothing was changed  |     0.3
  5 | runbooks/monthly-data-update.md | {"FILE": "data/contributions-2026-09-corrected.csv", "PERIOD": "2026-09"}        | alice    |        | precondition failed: nothing was changed  |     1.1
  6 | runbooks/user-request.md        | {"TICKET": "SUP-1042", "MEMBER_ID": "1", "NEW_EMAIL": "alice@new.example"}       | alice    |        | failed, rollback printed for the operator |     0.3
  7 | runbooks/user-request.md        | {"TICKET": "SUP-1042", "MEMBER_ID": "1", "NEW_EMAIL": "alice@new.example"}       | alice    |        | succeeded                                 |     1.1
  8 | runbooks/user-request.md        | {"TICKET": "SUP-1043", "MEMBER_ID": "2", "NEW_EMAIL": "bob.o'brien@example.org"} | alice    |        | succeeded                                 |     1.1
  9 | runbooks/scheduled-release.md   | {"VERSION": "v3", "MIGRATION": "3"}                                              | alice    |        | failed, rolled back                       |     8.4
 10 | runbooks/rollback.md            | {}                                                                               | alice    |      9 | succeeded                                 |     3.6
```

### Origins and further reading

- Article: "Documenting Architecture Decisions", Michael Nygard, 2011. https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- Docs: ADR templates and tooling (adr-tools, MADR), the adr.github.io community. https://adr.github.io/
- Article: "Do-nothing scripting: the key to gradual automation", Dan Slimmon, 2019. https://blog.danslimmon.com/2019/07/15/do-nothing-scripting-the-key-to-gradual-automation/
- Book: *Site Reliability Engineering*, Beyer, Jones, Petoff, Murphy (eds.), 2016, chapters 7 "The Evolution of Automation at Google" and 8 "Release Engineering". https://sre.google/sre-book/release-engineering/
- Book: *The Checklist Manifesto*, Atul Gawande, 2009 (read-do and do-confirm checklists).
- Book: *Docs for Developers*, Bhatti, Corleissen, Lambourne, Nunez, Waterhouse, 2021 (documentation as code, linting docs).

---

## 32. A design case, checked (`32-casebook/`)

**Pain: a design document that reads well and does not hold together.** A requirement has no acceptance criteria, so nobody can say when it is done. A journey step needs something no requirement asks for. The ER diagram shows a table the DDL does not create, the state diagram has a state the database refuses, a sequence diagram does not even parse, and the data model lets one person approve a bank details change twice. Each document was reviewed on its own; nobody checked them against each other.

**Reach for it when** you plan a rebuild or a new service on paper first (a discovery, a design review, a time-boxed design case) and want its parts to agree: requirements with testable criteria, journeys that map to them, diagrams that render, a data model that answers the journeys' questions.

**Do not reach for it when** the requirements live in a tracker with its own links: use its traceability report. The design fits on one page. Code exists: the acceptance criteria become executable specifications (23), which check the system rather than the plan.

A worked design case, a self-set exercise on a fictional organisation, time-boxed to three hours: rebuild a legacy member portal used by about forty partner organisations. Eleven Markdown documents: the scenario with a time plan and assumptions, a discovery plan and stakeholder map, personas and journeys, a functional specification with acceptance criteria, the architecture (C4 context and containers, sign-in and change request sequences), the ER data model with its DDL and the journeys' queries, the change request state machine, the accessibility and security approach, a strangler migration plan with a gantt, a risk register and KPIs. The demo first checks a flawed draft of the same documents, then the real ones: traceability, every Mermaid diagram rendered to SVG (committed), the DDL applied to Postgres and each journey's query run against it.

### Concepts

- **Time box**: three hours split by deliverable (`00-brief.md`), with the last ten minutes reserved for the checks. Assumptions are written down and numbered so discovery can confirm or replace them, and open questions name who must answer.
- **Discovery before requirements**: research questions, methods and a six-week plan (logs and support tickets first, then research sessions with members including assistive technology users, HR administrators and staff), a stakeholder map by influence and interest, and the outputs that close discovery: top tasks, KPI baselines, validated personas.
- **Personas and journeys**: four personas (two members, an employer administrator, a support agent) and four journeys written as numbered steps. Each step names the requirements it needs, which makes the journeys the test of the specification's completeness.
- **Acceptance criteria**: every requirement has criteria in Given / When / Then form, concrete enough to become an automated test. Cross-cutting requirements (accessibility, two languages, reliability, data protection) say `Applies to: all journeys`.
- **Traceability**: a check, not a spreadsheet. Every requirement has criteria and is used by a step or applies to all; every step maps to requirements that exist; every journey query belongs to a step. A criterion without Given, when and then ("should get an email") is reported as untestable.
- **Diagrams as code**: Mermaid in the Markdown, so diagrams are reviewed in the same diff as the text. Context as C4, containers as a flowchart (Mermaid's C4 layout cannot place external systems around a boundary), sequences for OIDC sign-in and the change request with its outbox, an ER diagram, a state machine, a gantt. mermaid-cli renders each one in headless Chromium, so a syntax error fails the build (a `;` ends a sequence message, which a reviewer reading the source does not see).
- **Consistency between views**: the ER diagram and the DDL must name the same tables, and the state machine must allow exactly the states the `status` CHECK allows. Two views of one thing drift unless something compares them.
- **The data model answers the journeys**: the DDL and a seed are applied to an empty database and each journey step's query runs in order, with an expected row count, or the named constraint that must refuse (any other error is a mismatch): J4.3 proves that the `four_eyes` constraint stops one person giving both approvals of a bank details change. The steps a signed-in user takes run as the application would: in a transaction, as the `portal_app` role, with the user's identity set by `set_config(..., true)` so it ends with the transaction. Row-level security on members, contributions, statements, change requests and uploads lets staff see everything, an employer administrator her employer's rows and a member his own; J3.4 shows the employer scope, and the same query with no identity set sees nothing, because the policies fail closed. A missing grant fails a journey too: without USAGE on the sequences, J2.4 cannot insert a change request.
- **Strangler migration plan**: phases by capability behind a routing facade (05), one data owner per capability, sync through an outbox (09) or CDC (10), parallel run on reads (04), uploads moved with a pilot of three employers then waves, and decommission when the old portal gets no traffic for 30 days.
- **Risk register and KPIs**: risks scored likelihood x impact with a mitigation, an owner and a link to the requirement or phase; KPIs with formula, baseline from the old portal, target and owner (computed as in 29).
- **Trade-offs**: the checks prove the documents agree with each other, not that they are right: only research and real use do that. Markers (`<!-- diagram: name -->`, `<!-- sql: J1.2 expect 1 -->`) and table formats are conventions the authors must follow. A time-boxed plan is a starting point for discovery, not a commitment; the scenario says what would be done with more time.

### Proof (`logs/32-casebook.log`)

The draft: each defect a review missed, found by the checks:

```
   PROBLEM REQ-06 has no acceptance criteria
   PROBLEM REQ-08 criterion is not Given/When/Then: "The member should get an email when her request is approved."
   PROBLEM J2.3 maps to no requirement
   PROBLEM J3.2 refers to REQ-19, which does not exist
   PROBLEM REQ-12 is used by no journey step
   PROBLEM table outbox is missing from the ER diagram
   PROBLEM state on_hold is not allowed by the status CHECK

   fixtures/draft/04-architecture.md:86       FAILED Parse error on line 13, got 'NEWLINE'
   J4.3 expected error four_eyes, got 0 row(s)
```

The real documents: every requirement has criteria and is used by a journey, or applies to all of them:

```
   REQ-01 Sign in with an organisation account          3 AC  J1.1 J2.1 J3.1
   REQ-02 View my profile                               1 AC  J1.2 J2.2
   REQ-03 View my contribution history                  2 AC  J1.3
   REQ-04 Request a change of address                   3 AC  J2.2 J2.3 J2.4
   REQ-05 Request a change of bank details              3 AC  J4.3
   REQ-06 Track my requests                             1 AC  J2.4 J2.5
   REQ-07 Download my annual statement                  1 AC  J1.4
   REQ-08 Be told when something changes                1 AC  J2.6
   REQ-09 Upload the monthly contributions file         2 AC  J3.2 J3.3
   REQ-10 See only my organisation's members            1 AC  J3.1 J3.4
   REQ-11 Work the change request queue                 2 AC  J4.1 J4.2 J4.3
   REQ-12 Audit every change                            1 AC  J4.2 J4.4
   REQ-13 Accessible to WCAG 2.2 AA and RGAA 4.1        2 AC  all journeys
   REQ-14 Available in French and English               1 AC  all journeys
   REQ-15 Reliable and fast enough                      1 AC  all journeys
   REQ-16 Personal data protected                       1 AC  all journeys
   18 journey steps, each mapped; ER entities = tables: 10; lifecycle states = status CHECK values: submitted, in_review, awaiting_second_approval, approved, rejected, cancelled, applied
```

Nine diagrams rendered:

```
   casebook/01-discovery.md:32                -> diagrams/01-stakeholder-map.svg          quadrantChart, 7831 bytes
   casebook/02-personas-journeys.md:38        -> diagrams/02-journey-change-address.svg   journey, 18262 bytes
   casebook/04-architecture.md:8              -> diagrams/04-c4-context.svg               c4, 38546 bytes
   casebook/04-architecture.md:33             -> diagrams/04-c4-container.svg             flowchart-v2, 132395 bytes
   casebook/04-architecture.md:62             -> diagrams/04-sequence-login.svg           sequence, 32895 bytes
   casebook/04-architecture.md:86             -> diagrams/04-sequence-change-request.svg  sequence, 34893 bytes
   casebook/05-data-model.md:6                -> diagrams/05-er-model.svg                 er, 195267 bytes
   casebook/06-change-request-lifecycle.md:6  -> diagrams/06-state-change-request.svg     stateDiagram, 50176 bytes
   casebook/08-migration-plan.md:16           -> diagrams/08-gantt-migration.svg          gantt, 13100 bytes
```

The journeys' queries against the DDL, the user's steps as `portal_app` under row-level security; the second approval by the first approver is refused by the `four_eyes` constraint, and the same model without the sequence grant fails the first write journey:

```
   10 tables created
   J1.2 expect 1               ok  1 row(s), first: name=alice employer=Acme status=active
   J1.3 expect 12              ok  12 row(s), first: period=2025-01 employer=Acme amount=412.50 year_total=4950.00
   J1.4 expect 1               ok  1 row(s), first: year=2025 total=4950.00 matches_history=true
   J2.2 expect 1               ok  1 row(s), first: address=8 avenue Foch, 69006 Lyon
   J2.4 expect 1               ok  1 row(s), first: reference=CR-1002 status=submitted
   J2.5 expect 1               ok  1 row(s), first: reference=CR-1002 type=address status=submitted submitted_at=2026-09-30
   J3.3 expect 2               ok  2 row(s), first: period=2026-09 line=4 reason=unknown member 999
   J3.4 expect 2               ok  2 row(s), first: id=2 name=bob employer_id=globex
   J3.4 expect 0               ok  0 row(s)
   J4.1 expect 2               ok  2 row(s), first: reference=CR-1001 type=bank_details status=awaiting_second_approval submitted_at=2026-09-29 sla_due=2026-10-02
   J4.2 expect 1               ok  1 row(s), first: reference=CR-1002 status=applied address=12 rue Garibaldi, 69003 Lyon
   J4.3 expect error four_eyes ok  new row for relation "change_requests" violates check constraint "four_eyes"
   J4.4 expect 1               ok  1 row(s), first: at=2026-10-02 actor=idp|dan reference=CR-1002 before=8 avenue Foch, 69006 Lyon after=12 rue Garibaldi, 69003 Lyon
   the same model without "GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO portal_app;": J2.4 expected 1, got permission denied for sequence change_requests_id_seq
```

### Origins and further reading

- Book: *Software Requirements*, Karl Wiegers and Joy Beatty, 3rd edition, 2013 (requirements traceability, acceptance criteria).
- Book: *User Story Mapping*, Jeff Patton, 2014 (journeys as the backbone of a backlog).
- Docs: "Discovery phase", GOV.UK Service Manual. https://www.gov.uk/service-manual/agile-delivery/how-the-discovery-phase-works
- Article: "The C4 model for visualising software architecture", Simon Brown. https://c4model.com/
- Docs: Mermaid diagram syntax (sequence, ER, state, gantt, C4, quadrant, journey). https://mermaid.js.org/intro/
- Article: "StranglerFigApplication", Martin Fowler, 2004, updated 2024. https://martinfowler.com/bliki/StranglerFigApplication.html
- Article: "Introducing BDD" (Given / When / Then), Dan North, 2006. https://dannorth.net/introducing-bdd/
- Book: *Mapping Experiences*, James Kalbach, 2nd edition, 2020 (journey maps, stakeholder mapping).

---

## Which one when

- **CRUD + audit (01)**: most apps. You need "who changed what" for compliance or support, and reads of current state dominate.
- **Expand / contract (02)**: any schema change on a system deployed without downtime. It is the default, not an advanced technique.
- **Event sourcing (03)**: the history *is* the domain (ledgers, workflows, bookings). You need to rebuild state, add new read models later, or answer "what was the state at version N" (or at time T, filtering on the events' `at`).
- **Parallel run (04)**: replacing logic whose exact behavior nobody fully knows (pricing, tax, permissions), before trusting the rewrite.
- **Strangler fig (05)**: replacing a whole system incrementally instead of a big-bang rewrite. It combines naturally with 04 (verify) and 10/11 (move the data).
- **Service reliability (06)**: any synchronous call to another service. Timeouts and a retry policy that knows which failures are transient are the default, not an add-on. Add idempotency keys the moment a retried call has side effects (charges, orders, emails), and a breaker and bulkhead when one dependency's outage must not take the caller or its other dependencies down with it.
- **File upload API (07)**: any HTTP resource that clients overwrite, cache, download in parts or sync: `If-Match` on every write, `If-None-Match` and `If-Range` on reads, an idempotency key on every create, and a change feed paged on a commit-safe cursor rather than a timestamp.
- **Saga (08)**: a business operation spans services that each own their data.
- **Outbox, polling (09)**: one service needs to reliably tell others that something happened in business terms, without dual writes, with the fewest moving parts. Start here.
- **CDC (10)**: getting changes out of a database into other systems (search index, cache, warehouse) without touching the writing code, when row-level diffs are what the consumer wants.
- **Outbox, CDC relay (11)**: same need as 09, when poll latency, DB load or table cleanup start to hurt, or you already run Debezium.
- **Choreographed saga (12)**: a short, stable cross-service flow between services owned by different teams, whose events are useful beyond this flow. Once the flow grows steps, branches or timers, or you need to see one saga's state in one place, go back to 08.
- **Partitioning (13)**: one table got big enough that indexes, vacuum or retention hurt, and the hot queries filter on one key. Try it before sharding: it is config, not code.
- **Sharding + read replicas (14)**: one server can no longer hold the data or absorb the writes (shards), or the reads (replicas), and almost every query stays within one key. Stale reads must be acceptable wherever you read from replicas.
- **Multi-tenancy (15)**: many customers share one product. Pool with RLS by default (app connects as a non-owner, `FORCE`, `SET LOCAL`, `tenant_id` first in every key and index), a schema per tenant only when tenants need their own tables, and a database per tenant for the few that need their own restore, deletion, region or capacity.
- **SERIALIZABLE (16)**: an invariant spans several rows or depends on rows that do not exist yet (capacity, overbooking, on-call rules), and cannot be written as a constraint or reduced to a lock on one parent row. One-row rules only need a conditional `UPDATE` or `FOR UPDATE`.
- **Audit trail through the outbox (17)**: several services need one audit trail of record with actors and reasons, that cannot miss a change made through the app or be edited.
- **Crypto-shredding (18)**: personal data sits in stores you cannot rewrite (an event log, an audit store, Kafka, backups), and erasing one person must make every copy unreadable. It works only if the key store's own backups are short-lived, and your counsel should confirm that key deletion counts as erasure.
- **Leader election (19)**: exactly one replica should run a job at a time (a scheduler, an order-preserving relay) and the work cannot be split by claiming rows; fence every write with the term.
- **Full-stack portal (20)**: a server-rendered React app over its own database, where most pages read the member's data and a few forms change it: server components for the reads, server actions for the writes, validation on the server, every query scoped to the session, and forms that work with JavaScript off.
- **Accessible forms (21)**: every form the public or members fill in: labels, errors in text tied to their field, an error summary that takes focus, a keyboard path to submit; an axe scan and a keyboard journey in the test suite, and a manual audit before claiming conformance.
- **End-to-end tests (22)**: the few journeys that must keep working in a real browser, in parallel on every change: role and label locators, web-first assertions instead of sleeps, a database per worker, login once, traces on failure; the rules themselves in unit tests.
- **Executable specifications (23)**: business rules agreed with people outside the team, with boundaries and exceptions, where you must show which requirement is tested and passing; keep the scenarios at the rule level against the domain, not the UI.
- **Characterization tests (24)**: before rewriting or refactoring deterministic logic whose rules only the code knows: record a golden master on generated boundary and random inputs, explain every mismatch with a rule, and write each keep-or-fix decision down before the rewrite ships.
- **Bilingual (25)**: any product that serves, or will serve, more than one language: whole-sentence ICU messages, `Intl` for every number and date, catalogues checked against each other in CI, and a pseudo-locale run before the first translation arrives.
- **Single sign-on (26)**: people already have an account in an identity provider and the app should not hold passwords; use the authorization code flow with PKCE, state and nonce through a maintained library, keep the session server-side, and map the IdP's groups to app roles checked on every route.
- **Data import (27)**: files from outside feed your tables on a schedule and can be resent, late, truncated or wrong; stage with `COPY`, reject per rule with a reason, upsert on the natural key in one transaction, record each file by its hash, and reconcile the result with the sender's control totals.
- **Resumable batch campaign (28)**: one job sends something to many people and must survive crashes and reruns; keep one row per recipient and period, claim with `SKIP LOCKED` and a lease, retry only transient failures with backoff, list the dead letters, and decide explicitly what happens to a send that may or may not have gone.
- **Product and service KPIs (29)**: as soon as a service has users and someone asks whether it works: define each KPI once with an owner and a target, compute it from events the app emits, measure availability on member requests against an SLO, and read percentiles rather than means.
- **CI/CD pipeline (30)**: from the second person on the code, or the second release: every change through the same lint, type, test, accessibility and audit gates, cheap checks first, and production changed only by a schedule or a release tag that deploys the artifact the pipeline tested.
- **Executable runbooks (31)**: a small team runs recurring operations (releases, data loads, member requests) by hand: write each as a runbook whose steps the runner executes, with preconditions, verification and a rollback it can run, record every run, and keep decisions in ADRs that a docs-lint checks.
- **Design case, checked (32)**: before building a rebuild or a new service, when several people will read the plan: write requirements with testable criteria, journeys that map to them and diagrams as code, then check that they trace, render and that the data model answers the journeys.

These combine: a strangler migration verifies with parallel runs and feeds the new service through CDC; a choreographed saga (12) publishes its events through per-service outboxes; every retried write between services carries 06's idempotency key; an event-sourced service (03) can publish its events through an outbox/CDC relay and keep its personal data crypto-shredded (18); a singleton relay or waker (09, 08) either claims rows or runs under a leader lease (19). On the product side, the portal (20) is the thing the others protect: its forms follow 21, its journeys are tested by 22 and its rules by 23, a rewrite of a legacy screen starts with 24, every string goes through 25, login comes from 26, the monthly import (27) and yearly campaign (28) are run from 31's runbooks, 29 says whether it works for members, 30 gates every change, and 32 is how the whole plan is written down before any of it is built.
