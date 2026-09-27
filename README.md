# samples

Thirteen minimal, real TypeScript examples of how to change a running system without breaking it: tracking change, evolving schemas, replacing code, coordinating services, publishing events, splitting data across servers and keeping invariants under concurrency. They are numbered by complexity. Read them in order: each one assumes the concepts of the ones before it. For the wider landscape (who coined what, and which books to read) see [MIGRATION-PATTERNS.md](MIGRATION-PATTERNS.md).

| # | Folder | Pain | New concepts | Infra | Run | Proof |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | [`01-crud-audit/`](01-crud-audit/) | lost history | transactions, before/after audit rows | Postgres | `./run-01-crud-audit.sh` | [`logs/01-crud-audit.log`](logs/01-crud-audit.log) |
| 02 | [`02-expand-contract/`](02-expand-contract/) | deploy breakage | zero-downtime schema change, rolling deploys, backfill | Postgres | `./run-02-expand-contract.sh` | [`logs/02-expand-contract.log`](logs/02-expand-contract.log) |
| 03 | [`03-event-sourcing/`](03-event-sourcing/) | state without its story | events as source of truth, fold, optimistic concurrency, projections | Postgres | `./run-03-event-sourcing.sh` | [`logs/03-event-sourcing.log`](logs/03-event-sourcing.log) |
| 04 | [`04-parallel-run/`](04-parallel-run/) | blind rewrite | control vs candidate, mismatch reporting, cutover | none | `./run-04-parallel-run.sh` | [`logs/04-parallel-run.log`](logs/04-parallel-run.log) |
| 05 | [`05-strangler-fig/`](05-strangler-fig/) | big-bang cutover | routing facade, capability-by-capability replacement, instant rollback | none (3 HTTP servers) | `./run-05-strangler-fig.sh` | [`logs/05-strangler-fig.log`](logs/05-strangler-fig.log) |
| 06 | [`06-saga/`](06-saga/) | partial failure | no distributed transactions, compensations, saga log, crash recovery, idempotent steps, durable timer and waker | Postgres (4 databases) | `./run-06-saga.sh` | [`logs/06-saga.log`](logs/06-saga.log) |
| 07 | [`07-outbox-polling/`](07-outbox-polling/) | dual write | dual-write problem, outbox table, polling relay, `SKIP LOCKED`, at-least-once, idempotent consumer | Postgres, Kafka | `./run-07-outbox-polling.sh` | [`logs/07-outbox-polling.log`](logs/07-outbox-polling.log) |
| 08 | [`08-cdc-debezium/`](08-cdc-debezium/) | invasive publishing | WAL, logical decoding, replication slot, LSN, Debezium, Kafka Connect | Postgres, Kafka, Connect | `./run-08-cdc-debezium.sh` | [`logs/08-cdc-debezium.log`](logs/08-cdc-debezium.log) |
| 09 | [`09-outbox-debezium/`](09-outbox-debezium/) | polling overhead | outbox relayed by CDC, EventRouter, immediate cleanup | Postgres, Kafka, Connect | `./run-09-outbox-debezium.sh` | [`logs/09-outbox-debezium.log`](logs/09-outbox-debezium.log) |
| 10 | [`10-partitioning/`](10-partitioning/) | table too big | declarative partitioning, partition key, pruning, unique-key limit | Postgres | `./run-10-partitioning.sh` | [`logs/10-partitioning.log`](logs/10-partitioning.log) |
| 11 | [`11-sharding-replicas/`](11-sharding-replicas/) | one-machine ceiling | shard key, app-side router, streaming replication, read replicas, replica lag, CP writes / AP reads | Postgres (2 primaries + scalable replicas) | `./run-11-sharding-replicas.sh` | [`logs/11-sharding-replicas.log`](logs/11-sharding-replicas.log) |
| 12 | [`12-serializable/`](12-serializable/) | race conditions | isolation levels, lost update, write skew, SSI, 40001 retry, materialized conflict | Postgres | `./run-12-serializable.sh` | [`logs/12-serializable.log`](logs/12-serializable.log) |
| 13 | [`13-audit-outbox/`](13-audit-outbox/) | central audit trail | audit events through per-service outboxes, shipper, dedupe by `event_id`, append-only store, the bypass gap | Postgres (3 databases) | `./run-13-audit-outbox.sh` | [`logs/13-audit-outbox.log`](logs/13-audit-outbox.log) |

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

---

## 01. CRUD with audit log (`01-crud-audit/`)

**Pain: lost history.** An `UPDATE` or `DELETE` overwrites the old value, so nobody can later say who changed what, when, or what it was before.

**Reach for it when** support or compliance asks who changed what, and reads of current state dominate: most business apps, with one service and one database.

**Do not reach for it when** the history is the domain and you need to rebuild state or add read models later (03). Writes that bypass the app must be caught too (triggers or `pgaudit`). Several services need one central trail (13).

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

---

## 02. Expand / contract schema change (`02-expand-contract/`)

**Pain: deploy breakage.** Old and new app versions run side by side during a rolling deploy, so a plain `RENAME` breaks whichever one expects the other name.

**Reach for it when** you change a schema (rename, split, type change) on a system where old and new app versions, or other readers of the table, run at the same time.

**Do not reach for it when** you can take downtime, or the app and migration deploy together as one unit (pre-launch, internal tool): the multi-release dance is pure cost. Purely additive changes (a new nullable column) are already safe and need no contract phase.

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

---

## 03. Event sourcing (`03-event-sourcing/`)

**Pain: state without its story.** A current-state table forgets how it got there, and a separate audit log (01) can drift from it. Here the history is the state.

**Reach for it when** the history is the domain: ledgers, bookings, workflows. You need to rebuild state, answer "what was it at time T", or add new read models from old events.

**Do not reach for it when** the domain is plain CRUD and nobody asks how a row got here. You only need an audit log (01 is far cheaper). You would apply it to a whole system by default: every event schema is a contract you version forever, and every current-state query needs a projection.

### Concepts

- **Events are the source of truth**: there is no `accounts` table. The `events` table stores facts in the past tense (`AccountOpened`, `MoneyDeposited`, `MoneyWithdrawn`). Rows are only ever inserted, never updated or deleted (by convention here; enforce it with `REVOKE UPDATE, DELETE` or a trigger).
- **Mistakes are fixed with new events**: a wrong deposit is corrected by a compensating event (a reversal), never by editing history.
- **Stream**: all events of one aggregate (one account), keyed by `stream_id`, ordered by `version` 1, 2, 3...
- **Rehydrate / fold**: current state = a `reduce` over the events that applies `evolve` and counts versions (`rehydrate` in `src/account.ts`). `evolve` is a pure function `(state, event) -> state`.
- **Command -> decide -> append**: a command (`withdraw 30`) loads the stream, rebuilds state, checks invariants (enough balance?), and returns *new events*. Only those events are persisted. A rejected command writes nothing.
- **Optimistic concurrency**: the writer says "I decided based on version N", so its events get versions N+1, N+2... `UNIQUE (stream_id, version)` makes a second writer that also read N fail with `ConcurrencyError`. That writer reloads, decides again against the fresh state, and appends (`handleWithRetry`, bounded, retries only `ConcurrencyError`). Re-deciding matters: of two concurrent withdrawals of 60 from 71, the loser's retry sees 11 and is rejected instead of overdrawing. No locks are held while deciding.
- **Time travel**: state at any past point = fold only the events before it. Business asks by date ("end of March"), so `readStream(id, before)` filters on `at` (recorded time, with an explicit timezone for the boundary). If the question is about effective time (backdated entries), the event needs its own effective date and the filter runs on that (bitemporal). Filtering by version is the same fold over a prefix.
- **Projections / read models**: new views (a balance table, a "total deposited" report, a search index) are built by replaying the events. They can be thrown away and rebuilt at any time, including views nobody thought of when the events were written. The demo's projection is an in-memory sum; a real read model lives in its own table with a checkpoint (last position applied) and lags slightly behind the writes. Separate write and read models is **CQRS**.
- **Trade-offs**: queries across aggregates need projections, events are forever (so schema evolution/upcasting matters), and long streams need snapshots to stay fast. `global_position` orders events across streams, but a BIGSERIAL can have gaps and can commit out of order under concurrent writers, so a projection that tails it needs a guard (a single writer, or reading only up to the oldest in-flight transaction).

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
   as of 2026-09-27T16:27:08.889Z: { owner: 'alice', balance: 70, version: 3 }
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

---

## 04. Parallel run, Scientist-style (`04-parallel-run/`)

**Pain: blind rewrite.** Tests cannot show that a rewrite matches legacy on every real input, so you find the differences after cutover, through users.

**Reach for it when** replacing logic whose exact behavior nobody fully knows (pricing, tax, permissions), when outputs can be compared, before the rewrite serves anyone.

**Do not reach for it when** the code has side effects that must not happen twice (charging, emailing) and the candidate cannot be stubbed. Outputs are nondeterministic (timestamps, random ids) and you will not normalize them. The rewrite changes behavior on purpose: every mismatch is noise.

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

---

## 05. Strangler fig behind a proxy (`05-strangler-fig/`)

**Pain: big-bang cutover.** Replacing a whole system in one switch is all-or-nothing: months without shipping, then one risky day with no easy way back.

**Reach for it when** replacing a large live system incrementally, when traffic can be routed by capability (URL, message type) and each piece can move on its own.

**Do not reach for it when** the system is small enough to rewrite in one go. Capabilities share one database so tightly that routing moves code but not data (the coupling stays). There is no commitment to finish: a half-strangled system runs two stacks forever.

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

---

## 06. Saga, orchestrated (`06-saga/`)

**Pain: partial failure.** Each service owns its database, so no transaction covers the whole order. A failure halfway leaves stock reserved and money taken for an order that will never ship.

**Reach for it when** one business operation spans services that each own their data, including long-running flows that wait (the `fraudHold` timer here).

**Do not reach for it when** the data lives in one database: use a transaction. A step cannot be compensated and must be atomic with another: redesign the boundary instead. The flow has many branches, waits and human steps: use a workflow engine (Temporal) rather than a hand-rolled step table. Splitting a service that needs strong consistency, then patching it with sagas, is the classic antipattern.

Places an order across inventory, payments and shipping, each with its own database, without a distributed transaction.

### Concepts

- **No transaction spans services**: each service owns its database (here, 4 real Postgres databases), so a `BEGIN ... COMMIT` cannot cover all three steps. Two-phase commit exists but couples every service's availability and is rarely used across services.
- **Saga**: a sequence of local transactions (`reserveInventory`, `chargePayment`, `createShipment`, with a `fraudHold` timer before shipping). Each commits on its own. If a later step fails, earlier ones are undone by **compensating actions** (`release`, `refund`), run in reverse order. Coined by Garcia-Molina and Salem ("Sagas", SIGMOD 1987) for long-lived transactions inside one database; microservices reuse the idea across databases.
- **Compensation is semantic, not a rollback**: a refund is a new fact; the charge still happened. Some steps cannot be compensated (an email already sent), so order steps as compensatable ones, then one pivot (the go/no-go step, here `createShipment`, which has no compensation), then retriable ones that must eventually succeed (Richardson's taxonomy).
- **Orchestration vs choreography**: here a central orchestrator (`src/orchestrator.ts`) tells each service what to do next. In choreography, services react to each other's events instead (usually via 07/09's outbox). Orchestration is easier to follow; choreography has no central component.
- **Saga log**: the orchestrator persists `state` and `step` after every step in its own database. After a crash, it reloads unfinished sagas and continues forward or keeps compensating. This assumes a single orchestrator; with several, claim a saga first (`SELECT ... FOR UPDATE SKIP LOCKED` or a lease column).
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

---

## 07. Transactional outbox, polling relay (`07-outbox-polling/`)

**Pain: dual write.** The app must update its database and tell Kafka, two systems with no shared transaction. A crash between the two writes loses the event or publishes one for a change that never committed.

**Reach for it when** a service must reliably tell others that something happened, in business terms, after changing its own database. Start here; it covers most volumes.

**Do not reach for it when** consumers want every row change from any writer, not business events (08). Losing a notification is acceptable: just publish, best effort. Poll latency, query load or table cleanup already hurt (09).

The simplest reliable way to publish events. No Debezium: just a table and a loop.

### Concepts

- **The dual-write problem**: a service must update its database *and* tell other services (publish to Kafka). These are two systems with no shared transaction. Commit then publish: a crash in between loses the event. Publish then commit: a failed commit leaves an event for something that never happened. Retries do not fix this, because the process that would retry is the one that crashed.
- **Outbox table**: instead of publishing, the service inserts the event as a row in `outbox` *in the same transaction* as the business change (`emit()` in `src/app.ts`). One atomic write: both happen or neither does. The app never talks to Kafka.
- **Outbox row shape**: `id` (BIGSERIAL; the relay publishes in id order, and ids follow insert order, not commit order), `event_id` (uuid, the identity consumers dedupe on), `aggregate_id` (becomes the Kafka key, so one order's events stay ordered on one partition), `type`, `payload` (JSONB), `created_at`, `published_at` (null = not yet sent). A partial index on `published_at IS NULL` keeps the poll query cheap as the table grows.
- **Polling publisher (the relay)**: a separate process (`src/relay.ts`) loops: open a transaction, claim up to 10 unpublished rows, send them to Kafka, set `published_at`, commit. It stops when nothing is left (a real relay sleeps and polls again). Holding the transaction open during the send is the simplest correct form; production relays keep batches small or claim rows with a lease column instead.
- **`FOR UPDATE SKIP LOCKED`**: claiming rows locks them, and other relay instances skip locked rows instead of waiting. You can run several relays for throughput or availability without sending the same row twice concurrently. The price: ordering. Two relays can claim one order's events in different batches and send them in either order, so keep a single active relay (others on standby) when per-aggregate order matters.
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

---

## 08. CDC: WAL -> Debezium -> Kafka (`08-cdc-debezium/`)

**Pain: invasive publishing.** Other systems (search, cache, warehouse) need every change, and making every write path publish is intrusive and misses writes that bypass the app (scripts, manual SQL).

**Reach for it when** keeping derived copies in sync with the source of truth: search indexes (Elasticsearch, Meilisearch), cache invalidation, a data warehouse or lake, a new database during a migration (05), or publishing changes from code you cannot change. The consumer wants every row change, including ones made outside the app, and does not care why the row changed.

**Do not reach for it when** consumers need business intent (`OrderPaid`, not `status pending -> paid`): use an outbox (07, 09), or they couple to your table schema. You want it as the audit log of record, which fails for three reasons. There is no actor: the WAL records the database role, not which user acted. It is asynchronous: a dropped slot or a re-snapshot silently loses changes, while 01's audit row commits with the change. Schema changes are not in it: an `ALTER TABLE` is not decoded, and Debezium skips `TRUNCATE` by default. It is fine as a broad "what changed" history on the side; `pgaudit` is the tool for catching scripts and migrations with the role that ran them.

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
- **Trade-offs**: events are row diffs, not business intent (`status pending -> paid`, not `OrderPaid`), and they are coupled to your table schema. There are more moving parts (Kafka, Connect, a slot to monitor). Delivery is at-least-once, so consumers must be idempotent.

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

---

## 09. Transactional outbox, CDC relay (`09-outbox-debezium/`)

**Pain: polling overhead.** 07's relay adds poll latency and query load, and its outbox table keeps growing until something cleans it up.

**Reach for it when** you have 07's need and poll latency, query load or table cleanup start to hurt, or Debezium is already running for 08.

**Do not reach for it when** nobody is ready to run Kafka Connect and watch a replication slot: 07 is enough for most volumes. The outbox also serves as a durable local record (13's audit events): immediate cleanup relies on the slot, and a lost slot loses those events for good.

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

---

## 10. Partitioning, one server (`10-partitioning/`)

**Pain: table too big.** One huge table means huge indexes, slow vacuum and expensive retention deletes.

**Reach for it when** one table got big enough that indexes, vacuum or retention hurt, and the hot queries filter on one key. Old data expires by time (`RANGE` by month, then `DROP` old partitions instead of a huge `DELETE`).

**Do not reach for it when** the table is small: partitioning adds planning cost and rules for nothing. Most queries do not filter on the partition key, so each one scans every partition. You expect more CPU, RAM or write throughput: it is still one machine (11). You need a unique constraint that does not include the key.

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

---

## 11. Sharding with read replicas (`11-sharding-replicas/`)

**Pain: one-machine ceiling.** Writes, storage and reads eventually exceed one Postgres server, and partitioning (10) does not help because it stays on that server.

**Reach for it when** one server can no longer hold the data or absorb the writes, after a bigger machine, partitioning (10) and replicas, and almost every query stays within one key (tenant, customer).

**Do not reach for it when** a bigger machine or read replicas alone would do: sharding is the most expensive step to undo. Queries or transactions routinely span keys (joins, reports): move those to a warehouse, or pick another key. Every read must see the latest write: then replica reads are wrong for it.

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

---

## 12. SERIALIZABLE: when it is a must (`12-serializable/`)

**Pain: race conditions.** Concurrent transactions each check a rule ("is stock left?") and each write, so both pass and you oversell. Postgres's default isolation does not stop it.

**Reach for it when** an invariant spans several rows or depends on rows that do not exist yet (capacity, overbooking, on-call rules), and cannot be a constraint or a lock on one parent row.

**Do not reach for it when** the rule is about one row: a conditional `UPDATE` or `FOR UPDATE` is enough. The app does not retry on `40001`: SERIALIZABLE then turns races into errors users see. A hot row is contended by many writers: retries pile up, so materialize the conflict or lock the parent row (scenario 8).

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

---

## 13. Audit trail through the outbox (`13-audit-outbox/`)

**Pain: central audit trail.** Each service can audit itself in the same transaction (01), but compliance and support need one trail across services, with the actor, that cannot miss a change made through the app or be edited afterwards.

**Reach for it when** the audit trail of record spans several services and needs the actor and the reason from the app, a guarantee that no change made through the app exists without its audit event, and one central, append-only store.

**Do not reach for it when** there is one service and one database: 01's audit table is enough, with no shipper to run. You need to catch writes that bypass the app (psql, scripts, migrations): that is `pgaudit` or triggers, alongside this. The central trail must reflect a change the instant it commits: shipping adds lag.

01's audit table combined with 07's outbox. Two services (`orders`, `billing`), each with its own database, write audit events into their own `audit_outbox`. A shipper copies them into a central `audit` database.

### Concepts

- **Audit event in the same transaction**: `audit()` in `src/services.ts` inserts into the service's `audit_outbox` using the business transaction's client. The app supplies what the database cannot know: the actor (`bob (support)`, `system:billing`), the reason (`goodwill discount after late delivery`) and the before/after snapshots. A rolled-back change (mallory's) leaves no audit event, and a committed app change cannot be missing its event.
- **The outbox is a temporary local copy**: rows wait with `shipped_at IS NULL` (partial index, as in 07). Once shipped they can be deleted on a retention schedule. The central store is the permanent record.
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

These combine: a strangler migration verifies with parallel runs and feeds the new service through CDC; a choreographed saga publishes its events through an outbox; an event-sourced service can publish its events through an outbox/CDC relay.
