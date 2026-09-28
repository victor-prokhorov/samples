# samples

Eighteen minimal, real TypeScript examples of how to change and run a live system without breaking it: tracking change, evolving schemas, replacing code, coordinating services, publishing events, splitting data across servers, keeping invariants under concurrency, calling services that fail, isolating tenants, erasing personal data and electing a leader. 01 to 13 are numbered by complexity: read them in order, each one assumes the concepts of the ones before it. 14 to 18 were added afterwards and are not ordered that way; each assumes only the earlier samples its section points to. For the wider landscape (who coined what, and which books to read) see [MIGRATION-PATTERNS.md](MIGRATION-PATTERNS.md).

| # | Folder | Pain | New concepts | Infra | Run | Proof |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | [`01-crud-audit/`](01-crud-audit/) | lost history | transactions, before/after audit rows | Postgres | `./run-01-crud-audit.sh` | [`logs/01-crud-audit.log`](logs/01-crud-audit.log) |
| 02 | [`02-expand-contract/`](02-expand-contract/) | deploy breakage | zero-downtime schema change, rolling deploys, backfill | Postgres | `./run-02-expand-contract.sh` | [`logs/02-expand-contract.log`](logs/02-expand-contract.log) |
| 03 | [`03-event-sourcing/`](03-event-sourcing/) | lost business history | events as source of truth, fold, optimistic concurrency, projections | Postgres | `./run-03-event-sourcing.sh` | [`logs/03-event-sourcing.log`](logs/03-event-sourcing.log) |
| 04 | [`04-parallel-run/`](04-parallel-run/) | blind rewrite | control vs candidate, mismatch reporting, cutover | none | `./run-04-parallel-run.sh` | [`logs/04-parallel-run.log`](logs/04-parallel-run.log) |
| 05 | [`05-strangler-fig/`](05-strangler-fig/) | big-bang cutover | routing facade, capability-by-capability replacement, instant rollback | none (3 HTTP servers) | `./run-05-strangler-fig.sh` | [`logs/05-strangler-fig.log`](logs/05-strangler-fig.log) |
| 06 | [`06-saga/`](06-saga/) | partial failure | no distributed transactions, compensations, saga log, crash recovery, idempotent steps, durable timer and waker | Postgres (4 databases) | `./run-06-saga.sh` | [`logs/06-saga.log`](logs/06-saga.log) |
| 07 | [`07-outbox-polling/`](07-outbox-polling/) | dual write | dual-write problem, outbox table, polling relay, `SKIP LOCKED`, at-least-once, idempotent consumer | Postgres, Kafka | `./run-07-outbox-polling.sh` | [`logs/07-outbox-polling.log`](logs/07-outbox-polling.log) |
| 08 | [`08-cdc-debezium/`](08-cdc-debezium/) | derived data drift | WAL, logical decoding, replication slot, LSN, Debezium, Kafka Connect | Postgres, Kafka, Connect | `./run-08-cdc-debezium.sh` | [`logs/08-cdc-debezium.log`](logs/08-cdc-debezium.log) |
| 09 | [`09-outbox-debezium/`](09-outbox-debezium/) | polling overhead | outbox relayed by CDC, EventRouter, immediate cleanup | Postgres, Kafka, Connect | `./run-09-outbox-debezium.sh` | [`logs/09-outbox-debezium.log`](logs/09-outbox-debezium.log) |
| 10 | [`10-partitioning/`](10-partitioning/) | table too big | declarative partitioning, partition key, pruning, unique-key limit | Postgres | `./run-10-partitioning.sh` | [`logs/10-partitioning.log`](logs/10-partitioning.log) |
| 11 | [`11-sharding-replicas/`](11-sharding-replicas/) | one-machine ceiling | shard key, app-side router, streaming replication, read replicas, replica lag, CP writes / AP reads | Postgres (2 primaries + scalable replicas) | `./run-11-sharding-replicas.sh` | [`logs/11-sharding-replicas.log`](logs/11-sharding-replicas.log) |
| 12 | [`12-serializable/`](12-serializable/) | write skew | isolation levels, lost update, write skew, SSI, 40001 retry, materialized conflict | Postgres | `./run-12-serializable.sh` | [`logs/12-serializable.log`](logs/12-serializable.log) |
| 13 | [`13-audit-outbox/`](13-audit-outbox/) | scattered audit logs | audit events through per-service outboxes, shipper, dedupe by `event_id`, append-only store, the bypass gap | Postgres (3 databases) | `./run-13-audit-outbox.sh` | [`logs/13-audit-outbox.log`](logs/13-audit-outbox.log) |
| 14 | [`14-service-reliability/`](14-service-reliability/) | cascading failure | timeouts, deadline propagation, bulkhead, retryable vs not, full jitter, retry budget, idempotency keys, circuit breaker | Postgres, 2 HTTP processes | `./run-14-service-reliability.sh` | [`logs/14-service-reliability.log`](logs/14-service-reliability.log) |
| 15 | [`15-choreographed-saga/`](15-choreographed-saga/) | one coordinator owns every reaction | choreography, per-service outbox + relay, idempotent consumer (`processed_messages`), offset commit vs redelivery, partition by order id, cross-topic reordering, forward-only state machine, correlation and causation ids, cyclic dependencies | Postgres (4 databases), Kafka | `./run-15-choreographed-saga.sh` | [`logs/15-choreographed-saga.log`](logs/15-choreographed-saga.log) |
| 16 | [`16-multi-tenancy/`](16-multi-tenancy/) | one tenant sees another's data | pool / bridge / silo, Row-Level Security, `FORCE`, `SET LOCAL` on pooled connections, tenant-leading keys and indexes, per-tenant migrations, per-tenant `statement_timeout`, moving a tenant to its own database | Postgres (5 databases) | `./run-16-multi-tenancy.sh` | [`logs/16-multi-tenancy.log`](logs/16-multi-tenancy.log) |
| 17 | [`17-crypto-shredding/`](17-crypto-shredding/) | erasure versus immutable data | per-subject DEK, envelope encryption (KEK), AES-256-GCM, unique IV, AAD, blind index, KEK rotation, key-store backups undo erasure | Postgres (3 databases, plus 2 restored backups) | `./run-17-crypto-shredding.sh` | [`logs/17-crypto-shredding.log`](logs/17-crypto-shredding.log) |
| 18 | [`18-leader-election/`](18-leader-election/) | a job that fires N times, or a single point of failure | lease row on the database clock, heartbeat, terms, failover after the TTL, self-fencing, fencing tokens, graceful release, `pg_try_advisory_lock` and its pooler trap | Postgres | `./run-18-leader-election.sh` | [`logs/18-leader-election.log`](logs/18-leader-election.log) |

Each script starts from a fresh state (`docker compose down -v && up` where there is infra), installs deps, runs the demo, then dumps the raw tables as proof. Everything it prints goes to `logs/<name>.log`. Needs Docker and Node 22.

Ports (chosen to avoid clashing with other local services):

| # | Postgres | Kafka | Kafka Connect | HTTP |
| --- | --- | --- | --- | --- |
| 01 | 55434 | | | |
| 02 | 55438 | | | |
| 03 | 55433 | | | |
| 05 | | | | 53000 proxy, 53001 legacy, 53002 new |
| 06 | 55439 | | | |
| 07 | 55437 | 59094 | | |
| 08 | 55435 | 59092 | 58083 | |
| 09 | 55436 | 59093 | 58084 | |
| 10 | 55440 | | | |
| 11 | 55441 shard 0 primary, 55442 shard 1 primary, replicas on random ports | | | |
| 12 | 55443 | | | |
| 13 | 55444 | | | |
| 14 | 55445 | | | 53010 payments, 53011 catalog |
| 15 | 55446 | 59095 | | |
| 16 | 55447 | | | |
| 17 | 55448 | | | |
| 18 | 55449 | | | |

---

## 01. CRUD with audit log (`01-crud-audit/`)

**Pain: lost history.** An `UPDATE` or `DELETE` overwrites the old value, so nobody can later say who changed what, when, or what it was before.

**Reach for it when** support or compliance asks who changed what, and reads of current state dominate: most business apps, with one service and one database.

**Do not reach for it when** the history is the domain and you need to rebuild state or add read models later (03). Writes that bypass the app must be audited too: use triggers (with `SET LOCAL app.actor` for the user) or `pgaudit`. Several services need one central trail (13).

### Concepts

- **CRUD**: the table holds only the *current* state. `UPDATE` overwrites, `DELETE` erases. On its own, the database cannot tell you what a row looked like yesterday or who changed it.
- **Audit log**: a second, append-only table. Every write adds one row: `entity`, `entity_id`, `action` (create/update/delete), `actor`, `before` and `after` snapshots as JSONB, and `at`. Append-only is a convention here; in production enforce it (`REVOKE UPDATE, DELETE ON audit_log`, or a trigger that rejects them).
- **Ordering**: `at` is `now()`, the transaction start time, so it can be out of order under contention; `history()` orders by `id`, which the row lock keeps in order per entity.
- **Same transaction**: the data change and its audit row are committed together (`tx()` in `src/db.ts`). Either both exist or neither does. That is what makes the log trustworthy. If you write the audit afterwards, a crash between the two leaves a silent gap.
- **Capturing `before`**: an update first runs `SELECT ... FOR UPDATE`. That locks the row, so no concurrent writer can change it between reading `before` and writing `after`.
- **Trade-off**: the audit is only as complete as the code paths that call it. A manual `psql` UPDATE or another service writing the same table bypasses it. The alternatives are DB triggers (catch every writer, but only know the DB role unless the app passes the user in, e.g. `SET LOCAL app.actor = 'bob'` read with `current_setting('app.actor')`) and CDC (08, reads the WAL). The audit also stores snapshots, not intent: it says the price went 49 -> 39, not *why*.

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
- **Dual write**: v2 writes both columns and still reads the old one. It runs next to v1, which knows nothing about `display_name`. Unlike the dual-write problem in 07, both columns go in one statement, so they cannot diverge.
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

**Do not reach for it when** the domain is plain CRUD and you only need to know who changed what: 01 is far cheaper. You would apply it to a whole system by default: every event schema is a contract you version forever, and every current-state query needs a projection that lags the write. You want it as the way services talk to each other: publish separate integration events through an outbox (07) instead of exposing the event store.

### Concepts

- **Events are the source of truth**: there is no `accounts` table. The `events` table stores facts in the past tense (`AccountOpened`, `MoneyDeposited`, `MoneyWithdrawn`). Rows are only ever inserted, never updated or deleted (by convention here; enforce it with `REVOKE UPDATE, DELETE` or a trigger).
- **Mistakes are fixed with new events**: a wrong deposit is corrected by a compensating event (a reversal), never by editing history.
- **Stream**: all events of one aggregate (one account), keyed by `stream_id`, ordered by `version` 1, 2, 3...
- **Rehydrate / fold**: current state = a `reduce` over the events that applies `evolve` and counts versions (`rehydrate` in `src/account.ts`). `evolve` is a pure function `(state, event) -> state`.
- **Command -> decide -> append**: a command (`withdraw 30`) loads the stream, rebuilds state, checks invariants (enough balance?), and returns *new events*. Only those events are persisted. A rejected command writes nothing.
- **Optimistic concurrency**: the writer says "I decided based on version N", so its events get versions N+1, N+2... `UNIQUE (stream_id, version)` makes a second writer that also read N fail with `ConcurrencyError`. That writer reloads, decides again against the fresh state, and appends (`handleWithRetry`, bounded, retries only `ConcurrencyError`). Re-deciding matters: of two concurrent withdrawals of 60 from 71, the loser's retry sees 11 and is rejected instead of overdrawing. No locks are held while deciding.
- **Time travel**: state at any past point = fold only the events before it. Business asks by date ("end of March"), so `readStream(id, before)` filters on `at` (recorded time, with an explicit timezone for the boundary). If the question is about effective time (backdated entries), the event needs its own effective date and the filter runs on that (bitemporal). Filtering by version is the same fold over a prefix.
- **Projections / read models**: new views (a balance table, a "total deposited" report, a search index) are built by replaying the events. They can be thrown away and rebuilt at any time, including views nobody thought of when the events were written. The demo's projection is an in-memory sum; a real read model lives in its own table with a checkpoint (last position applied) and lags slightly behind the writes. Separate write and read models is **CQRS**.
- **Trade-offs**: queries across aggregates need projections, events are forever (so schema evolution/upcasting matters, and personal data in them can only be erased by crypto-shredding, 17), and long streams need snapshots to stay fast. `global_position` orders events across streams, but a BIGSERIAL can have gaps and can commit out of order under concurrent writers, so a projection that tails it needs a guard (a single writer, or reading only up to the oldest in-flight transaction).

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

**Do not reach for it when** the system is small enough to replace in one release. The capability sits deep inside the monolith with no seam to route on: use branch by abstraction there. You would move the code but leave the shared database in place: plan the data move too (08, 09), or the coupling stays. There is no commitment to finish: a half-strangled system runs two stacks forever.

Replaces a monolith one capability at a time, behind a routing facade that clients never see change. Named by Martin Fowler (bliki "StranglerFigApplication", 2004).

### Concepts

- **Facade (the proxy)**: clients switch once to a proxy in front of the legacy system. From then on, every migration step is a routing change inside the proxy, invisible to clients. In production this is an API gateway, a load balancer rule, nginx or Envoy, and a cutover usually shifts a percentage of traffic or a user cohort (canary) before moving 100%.
- **Strangling**: build one capability (`/orders`) in the new service, then route only that path to it. The new system grows around the old one until nothing is left, like the fig vine the pattern is named after.
- **Same contract**: the new service must answer exactly like legacy, or clients break. The new service has its own internal model (`totalCents`, `state: "PAID"`) and translates it to the legacy shape at its edge. The demo records legacy's responses (status and body) as a baseline and checks every proxied response against it, so a translation bug would show up as `false`. 04's parallel run is how you gain that confidence before flipping a route.
- **Instant rollback**: pointing a route back is one config call (`PUT /_proxy/routes`), no deploy and no client change. That is what makes each step low-risk.
- **Decommission signal**: once legacy receives zero traffic (and nothing bypasses the proxy: batch jobs, direct DB readers, internal callers), it can be switched off.
- **What the demo simplifies**: both services hold hard-coded copies of the same data. In a real migration, data ownership is the hard part. The new service needs the data legacy owns, usually via CDC (08) or events (07, 09) during the transition, and writes must have one owner per capability at any time.

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

## 06. Saga, orchestrated (`06-saga/`)

**Pain: partial failure.** Each service owns its database, so no transaction covers the whole order. A failure halfway leaves stock reserved and money taken for an order that will never ship.

**Reach for it when** one business operation spans services that each own their data, including long-running flows that wait (the `fraudHold` timer here).

**Do not reach for it when** the data lives in one database: use a transaction. The operation needs isolation, so nobody may see or act on the half-done state: a saga has none (ACD, not ACID), so draw the service boundary around that data instead. The flow has many branches, long waits or human steps: use a workflow engine (Temporal) rather than a hand-rolled step table. Other teams' services should react to the same facts rather than be commanded: choreograph it (15).

Places an order across inventory, payments and shipping, each with its own database, without a distributed transaction.

### Concepts

- **No transaction spans services**: each service owns its database (here, 4 real Postgres databases), so a `BEGIN ... COMMIT` cannot cover all three steps. Two-phase commit exists but couples every service's availability and is rarely used across services.
- **Saga**: a sequence of local transactions (`reserveInventory`, `chargePayment`, `createShipment`, with a `fraudHold` timer before shipping). Each commits on its own. If a later step fails, earlier ones are undone by **compensating actions** (`release`, `refund`), run in reverse order. Coined by Garcia-Molina and Salem ("Sagas", SIGMOD 1987) for long-lived transactions inside one database; microservices reuse the idea across databases.
- **Compensation is semantic, not a rollback**: a refund is a new fact; the charge still happened. Some steps cannot be compensated (an email already sent), so order steps as compensatable ones, then one pivot (the go/no-go step, here `createShipment`, which has no compensation), then retriable ones that must eventually succeed (Richardson's taxonomy).
- **Orchestration vs choreography**: here a central orchestrator (`src/orchestrator.ts`) tells each service what to do next. In choreography, services react to each other's events instead, each through its own outbox; 15 runs this same order flow that way. Orchestration is easier to follow and change; choreography has no central component.
- **Saga log**: the orchestrator persists `state` and `step` after every step in its own database. After a crash, it reloads unfinished sagas and continues forward or keeps compensating. This assumes a single orchestrator; with several, claim a saga first (`SELECT ... FOR UPDATE SKIP LOCKED` or a lease column), or run one active orchestrator under a leader lease (18).
- **Idempotent steps**: a crash between "step ran" and "log updated" means the step runs again on recovery. Each step and compensation is keyed by saga id (steps: `INSERT ... ON CONFLICT DO NOTHING`; compensations: `DELETE ... RETURNING`, `UPDATE ... WHERE status = 'charged'`), so running it twice has the effect of running it once. `reserve` puts its insert and stock update in one local transaction so the pair is all-or-nothing.
- **Trade-offs**: no isolation. Other transactions can see intermediate states (stock reserved, payment not yet taken). Countermeasures include semantic locks (a `PENDING` status) and ordering steps so the riskiest come first. Also, a failed or timed-out step may have committed anyway; real orchestrators retry it or also run its (idempotent) compensation.
- **Toy services**: every `-> HTTP` log line stands for a network call to a separate microservice with its own remote database. Here each service is a function in `src/services.ts`, and each database is a separate Postgres database in one local container.
- **Durable timer**: a saga that has to wait (a fraud hold, a payment deadline, days in real life) must not keep a process alive for that long. The `fraudHold` step (`holdSec` in the order) writes `state = 'waiting'` and `wake_at` to the saga log, and `runSaga` returns. The wait is now a row, so any process can crash or be redeployed without losing it.
- **Waker**: `src/waker.ts` polls every 5s, claims due sagas in one statement (`UPDATE ... SET state = 'running' WHERE state = 'waiting' AND wake_at <= now() RETURNING id`, so two wakers cannot claim the same saga) and calls `runSaga`, which continues at the step after the timer. It wakes up to one poll interval late. Deliberately missing: a waker that crashes after claiming leaves the saga in `running` with no owner (a lease with an expiry fixes that), plus retries, heartbeats for long steps, and waiting for an external event (a signal) instead of a time. Temporal's server is essentially this loop with those pieces added: durable timers, task queues with leases, and signals.

### Proof (`logs/06-saga.log`)

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

## 07. Transactional outbox, polling relay (`07-outbox-polling/`)

**Pain: dual write.** The app must update its database and tell Kafka, two systems with no shared transaction. A crash between the two writes loses the event or publishes one for a change that never committed.

**Reach for it when** a service changes its own database and must reliably tell others what happened in business terms (`OrderPlaced`), and consumers can handle a duplicate: delivery is at least once. Start here; a polling relay covers most volumes.

**Do not reach for it when** consumers want every row change from any writer, not business events (08). Losing a notification is acceptable: publish best effort. The caller needs the other side's answer before it can reply: that is a synchronous call, not an event. Poll latency, query load or table cleanup already hurt (09).

The simplest reliable way to publish events. No Debezium: just a table and a loop.

### Concepts

- **The dual-write problem**: a service must update its database *and* tell other services (publish to Kafka). These are two systems with no shared transaction. Commit then publish: a crash in between loses the event. Publish then commit: a failed commit leaves an event for something that never happened. Retries do not fix this, because the process that would retry is the one that crashed.
- **Outbox table**: instead of publishing, the service inserts the event as a row in `outbox` *in the same transaction* as the business change (`emit()` in `src/app.ts`). One atomic write: both happen or neither does. The app never talks to Kafka.
- **Outbox row shape**: `id` (BIGSERIAL; the relay publishes in id order, and ids follow insert order, not commit order), `event_id` (uuid, the identity consumers dedupe on), `aggregate_id` (becomes the Kafka key, so one order's events stay ordered on one partition), `type`, `payload` (JSONB), `created_at`, `published_at` (null = not yet sent). A partial index on `published_at IS NULL` keeps the poll query cheap as the table grows.
- **Polling publisher (the relay)**: a separate process (`src/relay.ts`) loops: open a transaction, claim up to 10 unpublished rows, send them to Kafka, set `published_at`, commit. It stops when nothing is left (a real relay sleeps and polls again). Holding the transaction open during the send is the simplest correct form; production relays keep batches small or claim rows with a lease column instead.
- **`FOR UPDATE SKIP LOCKED`**: claiming rows locks them, and other relay instances skip locked rows instead of waiting. You can run several relays for throughput or availability without sending the same row twice concurrently. The price: ordering. Two relays can claim one order's events in different batches and send them in either order, so keep a single active relay (others on standby, elected as in 18) when per-aggregate order matters.
- **At-least-once delivery**: the send to Kafka and the `published_at` update cannot be atomic either. If the relay crashes after sending and before committing, the rows stay unpublished and are sent again on restart. Duplicates are possible; loss is not. The relay's order is deliberate: send first, mark second.
- **Idempotent consumer**: because of the above, consumers must dedupe. `src/consumer.ts` remembers processed `event_id`s and skips repeats. In real code that set is a `processed_events` table, updated in the same transaction as the consumer's own side effects.
- **Trade-offs vs 09 (CDC relay)**: polling is simple (Postgres + any broker, no Connect, no replication slot), but it adds latency (the poll interval), load on the DB, and a growing table you must clean up (delete or partition published rows). 09 removes all three at the cost of Debezium.

### Proof (`logs/07-outbox-polling.log`)

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

## 08. CDC: WAL -> Debezium -> Kafka (`08-cdc-debezium/`)

**Pain: derived data drift.** Search indexes, caches and the warehouse must mirror the database, but dual writes from app code race, fail halfway and miss writes that bypass the app (scripts, manual SQL), while nightly batch copies are hours stale.

**Reach for it when** keeping derived copies in sync with the source of truth: search indexes (Elasticsearch, Meilisearch), cache invalidation, a data warehouse or lake, a new database during a migration (05), or publishing changes from code you cannot change. The consumer wants every row change, including ones made outside the app, and does not care why the row changed.

**Do not reach for it when** consumers need business intent (`OrderPaid`, not `status pending -> paid`): use an outbox (07, 09), or every consumer couples to your table schema. You want the audit log of record: the WAL knows the database role, not the user, and a dropped slot loses the changes made while it was gone, while 01's audit row commits with the change (`pgaudit` catches scripts with their role). Nobody will watch the replication slot: a stalled consumer makes Postgres keep WAL until the disk fills.

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

### Proof (`logs/08-cdc-debezium.log`)

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

## 09. Transactional outbox, CDC relay (`09-outbox-debezium/`)

**Pain: polling overhead.** 07's relay adds poll latency and query load, and its outbox table keeps growing until something cleans it up.

**Reach for it when** you have 07's need and poll latency, query load or table cleanup start to hurt, or Debezium is already running for 08.

**Do not reach for it when** nobody is ready to run Kafka Connect and watch a replication slot: 07 is enough for most volumes. You would delete outbox rows at once but cannot afford to lose an event: a dropped slot then loses them for good, so keep rows until shipped and poll them, as 13 does.

Same outbox idea as 07, but the relay is Debezium reading the WAL (08) instead of a polling loop.

### Concepts

- **Log-tailing relay**: instead of polling `outbox`, Debezium reads outbox inserts from the WAL through a replication slot (08). No poll interval, no query load, no `published_at` column to maintain.
- **Outbox row shape** (Debezium's convention): `id` (event id, uuid), `aggregatetype` (routes to the topic), `aggregateid` (becomes the Kafka key, so all events of one order stay ordered on one partition), `type` (event name), `payload` (JSON).
- **EventRouter SMT**: a Kafka Connect transform. It unwraps Debezium's `{before, after, op}` envelope and emits just the payload to `outbox.event.<aggregatetype>`, with the event `id` and `eventType` as headers. Consumers see `OrderPaid {orderId}`, not a row diff. `setup.ts` relies on the defaults for routing, key and topic (`route.by.field=aggregatetype`, `table.field.event.key=aggregateid`, `route.topic.replacement=outbox.event.${routedByValue}`); only the payload expansion and the `eventType` header are configured.
- **Outbox vs raw CDC**: raw CDC (08) publishes table changes, so consumers couple to your schema and must guess intent. The outbox publishes explicit, versionable business events: the table is private, the event is the public contract.
- **Immediate cleanup**: the outbox row can be deleted in the same transaction it was inserted in. The insert is already in the WAL, so Debezium still publishes it, and EventRouter ignores deletes. The table never grows. Catch: this relies on the replication slot. If the connector is created after the writes, or the slot is dropped, Debezium re-snapshots the table and already-deleted events are gone for good; 07's polling table would still have them.
- **At-least-once + idempotent consumer**: same as 07. Debezium can re-send after a restart (it resumes from its last flushed offset), so consumers dedupe on the event `id` header (`seen` set in `src/consumer.ts`; no duplicate occurs in this run).
- **Trade-offs vs 07**: lower latency, no DB polling, no table cleanup, but Kafka Connect, Debezium and a replication slot to run and monitor. Both share the core limit: every write path must remember to emit.

### Proof (`logs/09-outbox-debezium.log`)

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

## 10. Partitioning, one server (`10-partitioning/`)

**Pain: table too big.** One huge table means huge indexes, slow vacuum and expensive retention deletes.

**Reach for it when** one table got big enough that indexes, vacuum or retention hurt, and the hot queries filter on one key. Old data expires by time (`RANGE` by month, then `DROP` old partitions instead of a huge `DELETE`).

**Do not reach for it when** the table is small or a better index would fix the slow query: partitioning adds planning cost and rules for nothing. Most queries do not filter on the partition key, so each one scans every partition. You would cut it into thousands of small partitions: planning time and memory grow with the count. You need more CPU, RAM or write throughput: it is still one machine (11).

Splits one table into four on the same Postgres. First of two steps: here the split is local; in 11 each piece moves to its own server.

### Concepts

- **Declarative partitioning**: `orders` is a parent with no storage of its own (`SELECT count(*) FROM ONLY orders` is 0). `PARTITION BY HASH (customer_id)` plus one `CREATE TABLE ... PARTITION OF orders FOR VALUES WITH (MODULUS 4, REMAINDER n)` per piece. The app reads and writes `orders`; Postgres picks the partition. `HASH` spreads keys evenly; `RANGE` (by month, for retention: `DETACH`/`DROP` an old month instantly instead of a huge `DELETE`) and `LIST` (by region, tenant) are the other two kinds.
- **Partition key**: the column the split is based on. Choose it from the queries: every hot query should filter on it. The same key becomes the shard key in 11.
- **Pruning**: `WHERE customer_id = 'alice'` plans a scan of one partition. A query without the key (`WHERE item = 'lamp'`) becomes an `Append` over all partitions. In 11 the same query would have to go to every shard.
- **Uniqueness includes the key**: each partition has its own indexes, so there is no global index. A primary key or unique constraint must contain the partition key, which is why the key is `(customer_id, id)`; `UNIQUE (id)` is rejected.
- **Still one server**: one transaction can touch several partitions and rolls back atomically, and changing the key moves the row between partitions in one statement. Both stop being free once the pieces live on different servers (11).
- **What it does not buy**: CPU, RAM, disk and write throughput are those of one machine. Partitioning makes big tables manageable (smaller indexes, vacuum per partition, cheap retention); it does not scale out.
- **Uneven with few keys**: 5 customers over 4 partitions left `orders_p3` empty. Hash evens out with many keys, not few, and one very large customer stays one hot partition.

### Proof (`logs/10-partitioning.log`)

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

## 11. Sharding with read replicas (`11-sharding-replicas/`)

**Pain: one-machine ceiling.** Writes, storage and reads eventually exceed one Postgres server, and partitioning (10) does not help because it stays on that server.

**Reach for it when** one server can no longer hold the data or absorb the writes, after a bigger machine, partitioning (10) and replicas, and almost every query stays within one key (tenant, customer).

**Do not reach for it when** a bigger machine, partitioning (10) or read replicas would do: sharding is the most expensive step to undo. Transactions or joins routinely span shard keys: pick another key, and send cross-shard reports to a warehouse. The key is skewed, so one tenant or one hot value outgrows its shard (move that tenant to its own database instead, 16). Every read must see the latest write: serve it from the primary, not a replica.

The four partitions of 10, reduced to two, each moved onto its own server (a shard), and each shard given read replicas. Everything is vanilla Postgres plus a small router in the app. Scope: no query spans two shards.

### Concepts

- **Shard = partition on its own server**: same `orders` table, same key, but now two independent Postgres primaries (ports 55441, 55442) that know nothing about each other. Postgres no longer routes: the app does (`src/router.ts`, `md5(customer_id) % 2`). Nothing stops a buggy caller from writing bob into the wrong shard; the router is the only guard.
- **What is config and what is code**: replication is config. What it actually needs: a `REPLICATION` role, a `pg_hba` line for it (`all` does not match replication connections) and `pg_basebackup -R` on the replica (writes `standby.signal` + `primary_conninfo`). `wal_level=replica` and `hot_standby=on` are Postgres 16 defaults, set explicitly in `docker-compose.yml` for visibility. Sharding is code: shard choice, write/read routing, replica discovery. Postgres has no built-in multi-server sharding. Its closest built-in piece is `postgres_fdw` foreign tables as partitions, which gets routing and pruning but no cross-shard atomicity; Citus is the extension that does the full job.
- **Streaming replication**: each replica connects to its primary and replays its WAL (08) byte for byte, so it is an exact, read-only copy of that shard (`cannot execute INSERT in a read-only transaction`). It is asynchronous by default: the primary commits without waiting for replicas.
- **One writer per shard (CP writes)**: every write for a key goes to one primary, so writes to a shard are serialized in one place and never conflict. When that primary is unreachable, writes to that shard fail instead of going somewhere else: consistency over availability. The other shard keeps accepting writes, so an outage costs a fraction of the keys, not all of them.
- **Replicas answer anyway (AP reads)**: a lagging or cut-off replica still answers, with the data it has replayed so far. Reads stay available and are eventually consistent. What that costs: no read-your-writes (step 5: alice's write committed, the next read said 2 orders, not 3) and two reads can go backwards in time if they hit different replicas. Where a read must be fresh, send it to the primary, or wait until the replica's `pg_last_wal_replay_lsn()` passes the write's LSN (what `waitForReplay` does).
- **CAP shorthand**: "CP writes / AP reads" is per operation (PACELC-style), not a CAP class of the whole system. Strictly, clients reading async replicas never get linearizability even without a partition, and "CP" here means single leader: unavailable when the leader is lost, whether by crash or partition.
- **Lag**: `pg_last_wal_receive_lsn()` vs `pg_last_wal_replay_lsn()` on the replica, `replay_lsn` in `pg_stat_replication` on the primary. Step 5 pauses replay to make lag deterministic: the WAL has arrived, it is just not applied yet.
- **Retained WAL**: without a replication slot, the primary keeps only `wal_keep_size` (128MB here) of old WAL. A replica down longer than that can never catch up and must be re-cloned, and nothing here notices (it stays healthy and serves ever older data). A slot per replica retains WAL until it is consumed, at the cost of filling the primary's disk if a replica never comes back (cap with `max_slot_wal_keep_size`).
- **Scaling reads**: a new replica is `pg_basebackup` + start, with no change on the primary. Each streaming replica holds one WAL sender and a running `pg_basebackup -X stream` two, so `max_wal_senders=10` (the default) caps a shard at about 8 replicas. Raising it on the primary means raising it on every replica too: a hot standby refuses to start with a lower value than its primary. Here `docker compose --scale` starts it and the router discovers it from `docker compose ps` (in production: DNS, a service registry or a proxy such as pgcat or HAProxy). Replicas scale reads only. Writes scale only by adding shards.
- **No failover, on purpose**: promoting a replica (`pg_promote()`, or Patroni/repmgr automatically) would bring writes back, but with async replication any commits the replica had not received are lost, and a primary that was only partitioned away (not dead) could keep taking writes: split brain. Failover needs fencing and a consensus store (etcd for Patroni). Here the shard just waits for its primary; after `docker compose start` the replicas reconnect by themselves.
- **Replica names**: `pg_stat_replication.application_name` is the container id (`$HOSTNAME`), because scaled containers share one config; the router names them from compose's container number instead.
- **Per-shard ids**: each primary has its own `BIGSERIAL`, so `id 1` exists on both shards. That is why the key stays `(customer_id, id)`; globally unique ids need UUIDs or a shard prefix.
- **Deliberately missing**: queries across shards (fan-out and merge in the router), transactions across shards (sagas, 06, or two-phase commit) and resharding. With `% N`, going from 2 to 3 shards moves about two thirds of the keys. Real systems hash into many fixed buckets and map buckets to shards, so resharding moves whole buckets.

### Proof (`logs/11-sharding-replicas.log`)

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

## 12. SERIALIZABLE: when it is a must (`12-serializable/`)

**Pain: write skew.** Concurrent transactions each check a rule over several rows ("fewer than 10 tickets sold?", "someone else still on call?"), each write a different row, and all commit, so the rule breaks. Postgres's default READ COMMITTED, and even REPEATABLE READ, let it through.

**Reach for it when** an invariant spans several rows or depends on rows that do not exist yet (capacity, overbooking, on-call rules) and cannot be a constraint or a lock on one parent row, or when there are too many such rules to find and guard each one by hand.

**Do not reach for it when** the rule is about one row, or is uniqueness or no overlap: a conditional `UPDATE`, `FOR UPDATE` or a constraint (`UNIQUE`, `EXCLUDE`) is enough. The app cannot retry the whole transaction on `40001`: SERIALIZABLE then turns races into errors users see. Many writers hit the same hot spot: aborts and retries pile up, so lock the parent row instead (scenario 8). Some writers of those tables would stay at READ COMMITTED: SSI only protects transactions that all run SERIALIZABLE.

Never sell more than we have: 10 keyboards or 10 concert tickets, 20 buyers at once. Back to one server: isolation levels are a guarantee of one Postgres, so under sharding (11) the rule must live inside one shard (here, `event_id` as the shard key).

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
  - **Not on replicas**: a hot standby (11) refuses SERIALIZABLE, so reads served by replicas are outside SSI. `SERIALIZABLE READ ONLY DEFERRABLE` on the primary gives long reports a snapshot that can never abort.
- **Materializing the conflict** (8): turn the many-row rule into a one-row lock. `SELECT ... FROM events WHERE id = 'concert' FOR UPDATE` first, then count and insert, all under READ COMMITTED. Buyers queue on the event row: no aborts, no retries, but no parallelism per event. A `sold` counter column (`UPDATE events SET sold = sold + 1 WHERE id = $1 AND sold < capacity`, in the same transaction as the insert) is the same idea: buyers still queue on the row, but hold the lock for less time since there is no `count(*)`. Every writer must go through it, and refunds must decrement it.
- **Choosing**: the rule is on one row → conditional `UPDATE` or `FOR UPDATE`. The rule is uniqueness or no overlap → a constraint. The rule spans rows and has one natural parent → lock the parent. The rule spans rows with no single parent, or there are many such rules and you do not want to find every one → `SERIALIZABLE` everywhere, plus a retry loop.

### Proof (`logs/12-serializable.log`)

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

## 13. Audit trail through the outbox (`13-audit-outbox/`)

**Pain: scattered audit logs.** Each service can audit itself in the same transaction (01), but compliance and support need one trail across services, with the actor, that cannot miss a change made through the app or be edited afterwards. Sending it to a central store straight from app code is a dual write that loses events (07).

**Reach for it when** the audit trail of record spans several services and needs the actor and the reason from the app, a guarantee that no change made through the app exists without its audit event, and one central, append-only store.

**Do not reach for it when** there is one service and one database: 01's audit table is enough, with no shipper to run. You need to catch writes that bypass the app (psql, scripts, migrations): run `pgaudit` or triggers alongside this. The central trail must show a change the instant it commits, or in one exact order across services: shipping adds lag, and cross-service order is only as good as the clocks.

01's audit table combined with 07's outbox. Two services (`orders`, `billing`), each with its own database, write audit events into their own `audit_outbox`. A shipper copies them into a central `audit` database.

### Concepts

- **Audit event in the same transaction**: `audit()` in `src/services.ts` inserts into the service's `audit_outbox` using the business transaction's client. The app supplies what the database cannot know: the actor (`bob (support)`, `system:billing`), the reason (`goodwill discount after late delivery`) and the before/after snapshots. A rolled-back change (mallory's) leaves no audit event, and a committed app change cannot be missing its event.
- **The outbox is a temporary local copy**: rows wait with `shipped_at IS NULL` (partial index, as in 07). Once shipped they can be deleted on a retention schedule. The central store is the permanent record, so personal data in its before/after snapshots can only be erased by crypto-shredding (17).
- **Shipper**: `src/shipper.ts` loops per service: claim up to 100 unshipped rows (`FOR UPDATE SKIP LOCKED`), insert them into `audit_events`, mark them shipped, commit, until a claim comes back empty. Send first, mark second: a crash in between means a re-send, never a loss. In production a broker (Kafka) usually sits between the shippers and the store; the guarantees are the same.
- **Dedupe by `event_id`**: `event_id` is the central table's primary key and the insert is `ON CONFLICT (event_id) DO NOTHING`. The re-sent events after the crash are skipped, so the trail has exactly one row per event.
- **Append-only, enforced**: a trigger rejects `UPDATE`, `DELETE` and `TRUNCATE` on `audit_events`. The table owner or a superuser can still disable or bypass it (`ALTER TABLE ... DISABLE TRIGGER`, `session_replication_role = replica`, `DROP TABLE`), so in production the shipper connects with a non-owner role granted `INSERT` only, and the store has its own credentials that no service holds. Hash-chaining rows makes tampering detectable too.
- **The bypass gap**: the trail only contains what app code emits. The run's manual `psql` UPDATE sets the order total to 0 and leaves no trace: the audit trail's last word stays 38.25. Database-level auditing (`pgaudit`, or triggers) catches such writes, with the database role instead of the user; run it alongside, not instead.
- **Order is per entity, not global**: the central row keeps `source_id` (the outbox `id`). For one entity the row lock (`FOR UPDATE` in `changeTotal`) serializes writers, so `source_id` gives that entity's exact order. Across entities it does not: a `BIGSERIAL` is assigned at insert, not at commit. Across services, `occurred_at` (`clock_timestamp()` on each service's clock) is only as good as clock sync. A global timeline is approximate.

### Proof (`logs/13-audit-outbox.log`)

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

## 14. Reliability between services (`14-service-reliability/`)

**Pain: one flaky dependency takes the caller down.** A call with no deadline waits as long as a hung dependency does, and every waiting call holds a socket the healthy dependencies need. Naive retries turn a blip into an outage, and retrying a POST that timed out after the server committed charges the customer twice.

**Reach for it when** a service calls another over the network on a request path: every such call needs a timeout, a retry policy that knows which failures are transient, and, for writes, an idempotency key. Add a breaker and a bulkhead when one dependency's outage must not slow down or starve everything else.

**Do not reach for it when** the work does not need an answer now: put it on a queue or an outbox (07) and let a consumer retry at its own pace. The operation spans services that each commit their own data: retries make each step safe, a saga (06) handles the whole. A service mesh or client library already gives you timeouts, retries and breakers: configure it rather than hand-rolling a second layer, and make sure only one layer retries.

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

### Proof (`logs/14-service-reliability.log`)

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

## 15. Saga, choreographed (`15-choreographed-saga/`)

**Pain: one coordinator owns every reaction.** 06's orchestrator calls every service's API and holds the whole flow, so anything else that should happen after a step (an email, loyalty points, an analytics feed) is a change to that one component, and the team that owns it becomes the queue. Removing it naively (services calling each other, or publishing to Kafka straight from code) brings back partial failure and dual writes.

**Reach for it when** a few services, owned by different teams, react to each other's business events in a short, stable flow (three or four steps, one or two failure paths), and the events are useful beyond this one flow.

**Do not reach for it when** the flow has many steps, branches, timers or human steps, or changes often: every change touches several services, and no one place shows the flow; use 06 or a workflow engine. You need to answer "where is order X right now?" in one query, or to reason about the failure paths in one file: choreography spreads both across services. The services form cycles (here three pairs listen to each other): an orchestrator removes them.

06's order flow (reserve stock, charge, ship; release and refund on failure), same inputs and same final stock, with no orchestrator. Four services, each with its own database, outbox, relay and Kafka topic, react to each other's events.

### Concepts

- **Choreography**: no service tells another what to do. `orders` publishes `OrderPlaced`; `inventory` reacts and publishes `InventoryReserved`; `payments` reacts and publishes `PaymentCharged` or `PaymentFailed`; `shipping` reacts and publishes `ShipmentCreated` or `ShipmentFailed`. The flow is not written down anywhere: it is the sum of the `on:` maps in `src/services.ts`. The client's only call is `POST /orders`, which returns as soon as the order is `pending`.
- **Compensation by events**: `PaymentFailed` makes `inventory` release and `orders` reject. `ShipmentFailed` makes `payments` refund, whose `PaymentRefunded` makes `inventory` release. That is the reverse order, as in 06, but each hop is a service reacting to an event, not a loop in one process.
- **Outbox per service, one transaction per reaction**: `handle()` in `src/bus.ts` opens one local transaction. It inserts the incoming `event_id` into `processed_messages`, runs the effect (reservation, charge, shipment) and inserts the outgoing event into that service's `outbox`. A relay per service (07's polling relay) sends the outbox to the service's topic. There is no dual write: effect, "I handled this" and "tell the others" commit together or not at all.
- **Offset commit vs redelivery**: Kafka learns that a consumer handled a message only when the consumer commits its offset, after the handler returns. The run kills `inventory` right after its transaction commits and before the offset commit. On restart Kafka redelivers `OrderPlaced`; its `event_id` is already in `processed_messages`, so the handler is skipped and nothing is reserved twice. The `InventoryReserved` row that the crashed transaction had committed is published by the relay, and the saga goes on. The ~5.7s gap in order-D's timeline is the restart plus the consumer group rebalance (session timeout 6s).
- **Ordering is per partition, not per saga**: events are keyed by order id, so one order's events stay in order within one topic (order-A lands on partition 2 of every topic, since all four have 3 partitions). Across topics there is no order at all. When `orders` stops reading `inventory-events` for a while (a slow partition, a lagging consumer), it sees `PaymentCharged` and `ShipmentCreated` for order-E before `InventoryReserved`.
- **The order service's own state machine**: `orders` tracks `pending -> reserved -> paid -> completed`, or `rejected`, from the events it hears. It only moves forward (a rank per status). An event that skips ahead jumps the status, and a late event that would move it back is recorded as processed and ignored. Duplicates never reach the state machine: `processed_messages` drops them first. The status is the order service's view, not the saga's state: order-C is `rejected` while the refund and the release are still in flight in two other services.
- **No single place knows the saga**: 06 answers "where is order-C?" with one row. Here the answer is spread over four outboxes and four `processed_messages` tables. Every event carries a correlation id (the order id: Kafka key and `outbox.order_id`) and a causation id (the event it reacted to). `src/timeline.ts` joins them into one timeline. In production that is distributed tracing or a consumer of every topic, and someone has to build and run it. `InventoryReleased` is processed by nobody, so no service ever learns that the compensation finished.
- **Cyclic dependencies**: the wiring printed at startup finds three pairs that listen to each other: `orders <-> inventory`, `inventory <-> payments`, `payments <-> shipping`. Each side must know the other's event names and payloads, so a schema change on one side is a coordinated change on both. Events also carry the whole order (event-carried state), so `shipping` receives the amount it never uses.
- **Changing the flow is harder**: in 06, adding a fraud check between reserve and charge is one line in `STEPS`. Here `payments` must stop reacting to `InventoryReserved` and react to `FraudCleared`; `inventory` must also release on `FraudRejected`; the `orders` state machine gains a status. That is three services redeployed in a safe order, while events published under the old flow are still in the topics.
- **When orchestration (06) is better**: long or branching flows, timers (06's durable `fraudHold` has no natural home here), human steps, flows that change often, and any need to see or query one saga's state. A common split is to orchestrate inside one team's bounded context and use events between contexts.
- **Toy services**: the four services run in one process with separate pools, relays and consumer groups. Each database is a separate Postgres database in one container. The demo waits for "settled" (outboxes drained, `processed_messages` counts stable) between scenarios so the log reads in order. Handlers are not retried on errors, and an out-of-stock path is left out.

### Proof (`logs/15-choreographed-saga.log`)

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

Same end state as 06: stock `10 - 2 (A) - 1 (D) - 1 (E) = 6`, C refunded, B never charged, only A, D and E shipped, D processed once:

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

## 16. Multi-tenancy: pool, bridge, silo (`16-multi-tenancy/`)

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

### Proof (`logs/16-multi-tenancy.log`)

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

## 17. Crypto-shredding (`17-crypto-shredding/`)

**Pain: erasure versus immutable data.** GDPR's right to erasure says a customer's personal data must go, but it sits in places you must not or cannot rewrite: an append-only event log (03), an append-only audit store (13), Kafka topics, and every backup taken since.

**Reach for it when** personal data lands in stores that are append-only, replicated or backed up for years, and erasing a person must reach every copy without rewriting any of them.

**Do not reach for it when** the data lives in one mutable table you can `DELETE` from and your backups expire within the erasure deadline: a plain delete is simpler. You need to search, sort or aggregate on the personal fields in the database: ciphertext supports none of that beyond exact-match blind indexes. The identifying part is the metadata (amounts, timestamps, locations): encryption of the named fields does not make the rest anonymous. Your counsel does not accept key deletion as erasure (EU guidance treats encrypted personal data as still personal data): keep the PII in a deletable side store the events point to (forgettable payloads) instead.

Each customer (data subject) gets a random data key (DEK). Personal fields in the append-only `events` table are AES-256-GCM ciphertext under that DEK; event type, order and amount stay in clear. DEKs live in a separate `keys` database, wrapped by a key-encryption key (KEK) from a `kms` database standing in for a KMS. Erasing alice deletes one key row, and every copy of her events, including an old backup, becomes unreadable.

### Concepts

- **Envelope encryption**: data is encrypted with a DEK, and the DEK is stored only encrypted ("wrapped") by a KEK. In production the KEK stays inside a KMS or HSM and you call it to wrap and unwrap; here `kms_keys` hands the KEK to the process, which a real KMS never does. The key store (`subject_keys`) holds `wrapped_dek` and `kek_id`, never a plaintext key.
- **One DEK per subject**: this is what makes erasure selective. Deleting alice's row in `subject_keys` makes her ciphertext undecryptable everywhere: the live table, replicas, Kafka topics, the backup restored into `events_restored`. Bob's key is untouched, so his reads are unchanged. Her rows stay, so history, counts and amounts (49.50 over 3 events) still add up.
- **Why not just delete the rows**: the events table is append-only, enforced by a trigger as in 13, and backups cannot be edited anyway. The run's `DELETE` is rejected.
- **AES-256-GCM with a unique IV**: `seal()` in `src/crypto.ts` draws a random 12-byte IV per call and stores `iv | tag | ciphertext`. Encrypting the same email twice gives two different ciphertexts, so equal values cannot be spotted. Reusing an IV under one GCM key breaks both confidentiality and authentication. Random 96-bit IVs are safe up to about 2^32 encryptions per key, and one key per subject stays far below that.
- **AAD**: each field is sealed with additional authenticated data `subjectId:field`, and each wrapped DEK with `dek:subjectId`. The AAD is not stored in the ciphertext; the reader must supply it, and a mismatch fails authentication. Alice's email pasted into her name field fails, and so does a single flipped bit. Bob's ciphertext in alice's row also fails, mainly because of the per-subject DEK. The subject part of the AAD is defence in depth, and it becomes essential once keys are shared (per tenant, per table).
- **Blind index for lookups**: ciphertext cannot be indexed or compared, so lookup by email goes through `HMAC(blind-index key, trim(lowercase(email)))`. That key is separate from the DEKs, and the index lives in `subject_lookup` in the key store. It cascades on erasure, so after erasure `lookup alice@example.com -> no subject`. Do not put a global-key HMAC in the immutable store: anyone holding that key and the email could still find the erased person's rows. Blind indexes only support exact match, and they leak equality: two rows with the same hash have the same email.
- **KEK rotation**: `npm run rotate` adds KEK 2, unwraps each DEK with its old KEK, rewraps it under the new one, and updates only `subject_keys`. The events' PII fingerprint (md5 over every ciphertext) is identical before and after: not one event was re-encrypted. Once every DEK is rewrapped, the old KEK can be destroyed, which also makes key-store backups wrapped under it useless.
- **The key store's backups undo erasure**: restoring the pre-erasure `keys` dump brings alice back in full (the cautionary step of the run). The key store needs its own backup policy: short retention within the erasure deadline, or an erasure log replayed after every restore. The same holds for its WAL archives and replicas. The flip side: the key store is now the one database whose loss makes every subject's data unreadable, and every read of PII depends on it, so it needs replicas and backups that are durable yet short-lived. A deleted Postgres row also stays in the heap until `VACUUM` reclaims it.
- **Derived plaintext copies**: anything that decrypted the data and kept it (projections, caches, search indexes, analytics exports, application logs) is outside the shredding. This run's own log still shows "Alice Martin", printed before the erasure. Such copies must hold only ciphertext or ids, or be rebuilt from the events after an erasure.
- **What it does not cover**: data already exported or sent to third parties, and metadata left in clear. Alice's amounts, order ids and timestamps are still in the log, and together they can identify a person. Encrypted personal data may also still count as personal data legally (see Verraes below), so check with counsel.

### Proof (`logs/17-crypto-shredding.log`)

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

## 18. Leader election (`18-leader-election/`)

**Pain: a job that fires N times, or a single point of failure.** Run three replicas of a cron-like scheduler and each one fires: three emails, three charges, three reports. Run one and it is a single point of failure. Work that must stay in order, like 07's relay, cannot simply be shared out either.

**Reach for it when** exactly one instance among several should do a piece of work at a time (a cron-like scheduler, a relay that must keep per-aggregate order, a partition owner), and you already run Postgres or a coordination service.

**Do not reach for it when** the work can be split instead: let every replica claim its own rows (07's relay with `FOR UPDATE SKIP LOCKED` when order does not matter, 06's waker with a conditional `UPDATE`), which scales and needs no leader. Two instances briefly overlapping would corrupt something that cannot check a fencing token: fix the storage side first, since no lease alone guarantees one leader. Consensus itself (replicated state, not just who leads) is the need: use etcd, ZooKeeper or Consul, never a hand-rolled protocol. Each run can claim itself: insert a `(job, scheduled_slot)` row under a unique key and let the replicas that lose the insert skip, so overlap is harmless and no leader is needed. A few seconds of outage are acceptable: one replica under a supervisor that restarts it costs about what a lease failover (the TTL) costs, with nothing to elect.

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

### Proof (`logs/18-leader-election.log`)

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

## Which one when

- **CRUD + audit (01)**: most apps. You need "who changed what" for compliance or support, and reads of current state dominate.
- **Expand / contract (02)**: any schema change on a system deployed without downtime. It is the default, not an advanced technique.
- **Event sourcing (03)**: the history *is* the domain (ledgers, workflows, bookings). You need to rebuild state, add new read models later, or answer "what was the state at version N" (or at time T, filtering on the events' `at`).
- **Parallel run (04)**: replacing logic whose exact behavior nobody fully knows (pricing, tax, permissions), before trusting the rewrite.
- **Strangler fig (05)**: replacing a whole system incrementally instead of a big-bang rewrite. It combines naturally with 04 (verify) and 08/09 (move the data).
- **Saga (06)**: a business operation spans services that each own their data.
- **Outbox, polling (07)**: one service needs to reliably tell others that something happened in business terms, without dual writes, with the fewest moving parts. Start here.
- **CDC (08)**: getting changes out of a database into other systems (search index, cache, warehouse) without touching the writing code, when row-level diffs are what the consumer wants.
- **Outbox, CDC relay (09)**: same need as 07, when poll latency, DB load or table cleanup start to hurt, or you already run Debezium.
- **Partitioning (10)**: one table got big enough that indexes, vacuum or retention hurt, and the hot queries filter on one key. Try it before sharding: it is config, not code.
- **Sharding + read replicas (11)**: one server can no longer hold the data or absorb the writes (shards), or the reads (replicas), and almost every query stays within one key. Stale reads must be acceptable wherever you read from replicas.
- **SERIALIZABLE (12)**: an invariant spans several rows or depends on rows that do not exist yet (capacity, overbooking, on-call rules), and cannot be written as a constraint or reduced to a lock on one parent row. One-row rules only need a conditional `UPDATE` or `FOR UPDATE`.
- **Audit trail through the outbox (13)**: several services need one audit trail of record with actors and reasons, that cannot miss a change made through the app or be edited.
- **Service reliability (14)**: any synchronous call to another service. Timeouts and a retry policy that knows which failures are transient are the default, not an add-on. Add idempotency keys the moment a retried call has side effects (charges, orders, emails), and a breaker and bulkhead when one dependency's outage must not take the caller or its other dependencies down with it.
- **Choreographed saga (15)**: a short, stable cross-service flow between services owned by different teams, whose events are useful beyond this flow. Once the flow grows steps, branches or timers, or you need to see one saga's state in one place, go back to 06.
- **Multi-tenancy (16)**: many customers share one product. Pool with RLS by default (app connects as a non-owner, `FORCE`, `SET LOCAL`, `tenant_id` first in every key and index), a schema per tenant only when tenants need their own tables, and a database per tenant for the few that need their own restore, deletion, region or capacity.
- **Crypto-shredding (17)**: personal data sits in stores you cannot rewrite (an event log, an audit store, Kafka, backups), and erasing one person must make every copy unreadable. It works only if the key store's own backups are short-lived, and your counsel should confirm that key deletion counts as erasure.
- **Leader election (18)**: exactly one replica should run a job at a time (a scheduler, an order-preserving relay) and the work cannot be split by claiming rows; fence every write with the term.

These combine: a strangler migration verifies with parallel runs and feeds the new service through CDC; a choreographed saga (15) publishes its events through per-service outboxes; every retried write between services carries 14's idempotency key; an event-sourced service (03) can publish its events through an outbox/CDC relay and keep its personal data crypto-shredded (17); a singleton relay or waker (07, 06) either claims rows or runs under a leader lease (18).
