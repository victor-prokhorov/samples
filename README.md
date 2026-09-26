# samples

Nine minimal, real TypeScript examples of how to change a running system without breaking it: tracking change, evolving schemas, replacing code, coordinating services and publishing events. They are numbered by complexity. Read them in order: each one assumes the concepts of the ones before it. For the wider landscape (who coined what, and which books to read) see [MIGRATION-PATTERNS.md](MIGRATION-PATTERNS.md).

| # | Folder | New concepts | Infra | Run | Proof |
| --- | --- | --- | --- | --- | --- |
| 01 | [`01-crud-audit/`](01-crud-audit/) | transactions, before/after audit rows | Postgres | `./run-01-crud-audit.sh` | [`logs/01-crud-audit.log`](logs/01-crud-audit.log) |
| 02 | [`02-expand-contract/`](02-expand-contract/) | zero-downtime schema change, rolling deploys, backfill | Postgres | `./run-02-expand-contract.sh` | [`logs/02-expand-contract.log`](logs/02-expand-contract.log) |
| 03 | [`03-event-sourcing/`](03-event-sourcing/) | events as source of truth, fold, optimistic concurrency, projections | Postgres | `./run-03-event-sourcing.sh` | [`logs/03-event-sourcing.log`](logs/03-event-sourcing.log) |
| 04 | [`04-parallel-run/`](04-parallel-run/) | control vs candidate, mismatch reporting, cutover | none | `./run-04-parallel-run.sh` | [`logs/04-parallel-run.log`](logs/04-parallel-run.log) |
| 05 | [`05-strangler-fig/`](05-strangler-fig/) | routing facade, capability-by-capability replacement, instant rollback | none (3 HTTP servers) | `./run-05-strangler-fig.sh` | [`logs/05-strangler-fig.log`](logs/05-strangler-fig.log) |
| 06 | [`06-saga/`](06-saga/) | no distributed transactions, compensations, saga log, crash recovery, idempotent steps | Postgres (4 databases) | `./run-06-saga.sh` | [`logs/06-saga.log`](logs/06-saga.log) |
| 07 | [`07-outbox-polling/`](07-outbox-polling/) | dual-write problem, outbox table, polling relay, `SKIP LOCKED`, at-least-once, idempotent consumer | Postgres, Kafka | `./run-07-outbox-polling.sh` | [`logs/07-outbox-polling.log`](logs/07-outbox-polling.log) |
| 08 | [`08-cdc-debezium/`](08-cdc-debezium/) | WAL, logical decoding, replication slot, LSN, Debezium, Kafka Connect | Postgres, Kafka, Connect | `./run-08-cdc-debezium.sh` | [`logs/08-cdc-debezium.log`](logs/08-cdc-debezium.log) |
| 09 | [`09-outbox-debezium/`](09-outbox-debezium/) | outbox relayed by CDC, EventRouter, immediate cleanup | Postgres, Kafka, Connect | `./run-09-outbox-debezium.sh` | [`logs/09-outbox-debezium.log`](logs/09-outbox-debezium.log) |

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

---

## 01. CRUD with audit log (`01-crud-audit/`)

### Concepts

- **CRUD**: the table holds only the *current* state. `UPDATE` overwrites, `DELETE` erases. On its own, the database cannot tell you what a row looked like yesterday or who changed it.
- **Audit log**: a second, append-only table. Every write adds one row: `entity`, `entity_id`, `action` (create/update/delete), `actor`, `before` and `after` snapshots as JSONB, and `at`.
- **Same transaction**: the data change and its audit row are committed together (`tx()` in `src/db.ts`). Either both exist or neither does. That is what makes the log trustworthy. If you write the audit afterwards, a crash between the two leaves a silent gap.
- **Capturing `before`**: an update first runs `SELECT ... FOR UPDATE`. That locks the row, so no concurrent writer can change it between reading `before` and writing `after`.
- **Trade-off**: the audit is only as complete as the code paths that call it. A manual `psql` UPDATE or another service writing the same table bypasses it. The alternatives are DB triggers (catch every writer) and CDC (08, reads the WAL). The audit also stores snapshots, not intent: it says the price went 49 -> 39, not *why*.

### Proof (`logs/01-crud-audit.log`)

The audit insert fails (an empty actor violates `CHECK (actor <> '')`), so the price change rolls back with it:

```
## 3. Atomicity
   rejected: new row for relation "audit_log" violates check constraint "audit_log_actor_check"
   price still: 39.00
```

After the delete, `products` is empty but the history survives. Note id `4` is missing from `audit_log`: the rolled-back insert used up a sequence value and then vanished with its transaction.

```
 id | name | price
----+------+-------
(0 rows)

 id | action | actor | before                                         | after
  1 | create | alice |                                                | {"name": "Keyboard", "price": "49.00"}
  2 | update | bob   | {"name": "Keyboard", "price": "49.00"}         | {"name": "Keyboard", "price": "39.00"}
  3 | update | alice | {"name": "Keyboard", "price": "39.00"}         | {"name": "Mech Keyboard", "price": "39.00"}
  5 | delete | carol | {"name": "Mech Keyboard", "price": "39.00"}    |
```

---

## 02. Expand / contract schema change (`02-expand-contract/`)

Renames `users.name` to `display_name` with zero downtime. In every phase, the app versions that overlap during a rolling deploy must all keep working.

### Concepts

- **Rolling deploy**: new instances start while old ones still serve traffic, so two app versions always share one schema for a while. A schema change is safe only if it works for both the version before and the version after.
- **Why a plain `RENAME` fails**: it is atomic for the database but instant breakage for every instance still running the old code. The same holds for dropping a column, adding `NOT NULL` without a default, or changing a type.
- **Expand**: only additive, backward-compatible changes. Add `display_name` as nullable, and relax `NOT NULL` on `name` so a future version can stop writing it.
- **Dual write**: v2 writes both columns and still reads the old one. It runs next to v1, which knows nothing about `display_name`.
- **Backfill**: once v1 is fully retired, copy `name` into `display_name` for old rows (`UPDATE ... WHERE display_name IS NULL`; batch it on big tables). Doing it earlier would leave gaps, because v1 keeps writing rows without the new column.
- **Switch reads**: v3 reads `display_name`. It is only safe after the backfill; the demo probes a premature switch and finds blank names.
- **Tighten**: when every writer fills `display_name`, make it `NOT NULL`. Then v4 stops writing `name`.
- **Contract**: when no running version touches `name`, drop it. Each phase is a separate deploy that can be paused or rolled back; only the contract step is one-way.
- **Trade-offs**: one logical change becomes about four deploys and three migrations spread over days. Tools like `pgroll` and `reshape` automate the pattern with views and triggers so both schema versions are served at once.

### Proof (`logs/02-expand-contract.log`)

The naive rename breaks the running v1 instantly:

```
   migration naive: ALTER TABLE users RENAME COLUMN name TO display_name
   v1 (write name, read name): FAILS: column "name" of relation "users" does not exist
```

Every phase keeps both overlapping versions working, and reading the new column before the backfill would show blanks:

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

### Concepts

- **Events are the source of truth**: there is no `accounts` table. The `events` table stores facts in the past tense (`AccountOpened`, `MoneyDeposited`, `MoneyWithdrawn`). Rows are only ever inserted, never updated or deleted.
- **Stream**: all events of one aggregate (one account), keyed by `stream_id`, ordered by `version` 1, 2, 3...
- **Rehydrate / fold**: current state = `events.reduce(evolve, initial)` (`src/account.ts`). `evolve` is a pure function `(state, event) -> state`.
- **Command -> decide -> append**: a command (`withdraw 30`) loads the stream, rebuilds state, checks invariants (enough balance?), and returns *new events*. Only those events are persisted. A rejected command writes nothing.
- **Optimistic concurrency**: the writer says "I decided based on version N", so its events get versions N+1, N+2... `UNIQUE (stream_id, version)` makes a second writer that also read N fail with `ConcurrencyError`. That writer reloads and retries. No locks are held while deciding.
- **Time travel**: state at any past point = fold a prefix of the stream.
- **Projections / read models**: new views (a balance table, a "total deposited" report, a search index) are built by replaying the events. They can be thrown away and rebuilt at any time, including views nobody thought of when the events were written.
- **Trade-offs**: queries across aggregates need projections, events are forever (so schema evolution/upcasting matters), and long streams need snapshots to stay fast. `global_position` gives a total order for projection builders to follow.

### Proof (`logs/03-event-sourcing.log`)

The invariant is checked against rebuilt state, and two writers race:

```
## 2. Invariants are checked against rebuilt state
   rejected: insufficient funds: balance 70, asked 500

## 3. Optimistic concurrency
   writer A and writer B both read v3
   writer A appended v4
   writer B: ConcurrencyError=true (stream account-... moved past v3)
```

State at any point in time, plus a projection derived after the fact:

```
   current state: { owner: 'alice', balance: 71, version: 4 }
   as of v3: { owner: 'alice', balance: 70, version: 3 }
   as of v1: { owner: 'alice', balance: 0, version: 1 }
   total deposited = 101
```

The raw table has exactly 4 facts: nothing from the rejected withdrawal and nothing from losing writer B. The constraint doing the work is shown below it.

```
 global_position | version |      type      |        data
               1 |       1 | AccountOpened  | {"owner": "alice"}
               2 |       2 | MoneyDeposited | {"amount": 100}
               3 |       3 | MoneyWithdrawn | {"amount": 30}
               4 |       4 | MoneyDeposited | {"amount": 1}

 events_stream_id_version_key | UNIQUE (stream_id, version)
```

---

## 04. Parallel run, Scientist-style (`04-parallel-run/`)

Proves a rewrite matches the legacy code on real traffic before it serves anyone.

### Concepts

- **Control and candidate**: every request runs the legacy function (control) and the rewrite (candidate). The caller always gets the control result, so users are never exposed to the rewrite while it is being checked.
- **Experiment** (`src/scientist.ts`): runs both, compares results with deep equality, and records every mismatch with its input. It swallows candidate exceptions (the rewrite crashing must not hurt users) and randomizes which side runs first, so ordering effects show up.
- **Real inputs beat unit tests**: legacy code encodes years of undocumented behavior. Production traffic finds the edge cases nobody wrote a test for; here, the free-shipping boundary (`>=` vs `>`), per-item vs per-order weight rounding, and empty carts.
- **Iterate to zero**: fix the candidate and keep running until mismatches stay at zero over a meaningful volume.
- **Cutover**: swap roles. The rewrite becomes control (it serves) and legacy becomes the candidate (it is still checked). Once that is quiet, delete legacy.
- **Limits**: only safe for side-effect-free reads; running a write twice doubles it (for writes, compare against a shadow copy or use 05's routing instead). It costs double compute while it runs. For HTTP-level comparison, the same idea is called traffic shadowing or dark launching.

### Proof (`logs/04-parallel-run.log`)

The buggy rewrite disagrees on 567 of 1000 orders, yet every user got the legacy answer:

```
   experiment "shipping-v1": 1000 runs, 567 mismatches (188 candidate exceptions)
   users unaffected: served total 1980900 === legacy total 1980900: true
```

The mismatches group into three distinct bugs, each with a concrete input to reproduce:

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

Replaces a monolith one capability at a time, behind a routing facade that clients never see change.

### Concepts

- **Facade (the proxy)**: clients switch once to a proxy in front of the legacy system. From then on, every migration step is a routing change inside the proxy, invisible to clients. In production this is an API gateway, a load balancer rule, nginx or Envoy.
- **Strangling**: build one capability (`/orders`) in the new service, then route only that path to it. The new system grows around the old one until nothing is left, like the fig vine the pattern is named after.
- **Same contract**: the new service must answer exactly like legacy, or clients break. The demo records legacy's responses as a baseline and checks every proxied response against it. 04's parallel run is how you gain that confidence before flipping a route.
- **Instant rollback**: pointing a route back is one config call (`PUT /_proxy/routes`), no deploy and no client change. That is what makes each step low-risk.
- **Decommission signal**: once legacy receives zero traffic, it can be switched off.
- **What the demo simplifies**: both services read the same in-memory fixtures. In a real migration, data ownership is the hard part. The new service needs the data legacy owns, usually via CDC (08) or events (07, 09) during the transition, and writes must have one owner per capability at any time.

### Proof (`logs/05-strangler-fig.log`)

Legacy traffic shrinks as routes move, with a rollback in the middle, and every response keeps legacy's contract:

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

Places an order across inventory, payments and shipping, each with its own database, without a distributed transaction.

### Concepts

- **No transaction spans services**: each service owns its database (here, 4 real Postgres databases), so a `BEGIN ... COMMIT` cannot cover all three steps. Two-phase commit exists but couples every service's availability and is rarely used across services.
- **Saga**: a sequence of local transactions (`reserveInventory`, `chargePayment`, `createShipment`). Each commits on its own. If a later step fails, earlier ones are undone by **compensating actions** (`release`, `refund`), run in reverse order.
- **Compensation is semantic, not a rollback**: a refund is a new fact; the charge still happened. Some steps cannot be compensated (an email already sent), so put them last or make them pivot points.
- **Orchestration vs choreography**: here a central orchestrator (`src/orchestrator.ts`) tells each service what to do next. In choreography, services react to each other's events instead (usually via 07/09's outbox). Orchestration is easier to follow; choreography has no central component.
- **Saga log**: the orchestrator persists `state` and `step` after every step in its own database. After a crash, it reloads unfinished sagas and continues forward or keeps compensating.
- **Idempotent steps**: a crash between "step ran" and "log updated" means the step runs again on recovery. Each step is keyed by saga id (`INSERT ... ON CONFLICT DO NOTHING`, `UPDATE ... WHERE status = 'charged'`), so running it twice has the effect of running it once.
- **Trade-offs**: no isolation. Other transactions can see intermediate states (stock reserved, payment not yet taken). Countermeasures include semantic locks (a `PENDING` status) and ordering steps so the riskiest come first.

### Proof (`logs/06-saga.log`)

Payment failure compensates one step; shipping failure compensates two, in reverse:

```
   [order-B] step 2 chargePayment: FAILED (card declined for 5000.00) -> compensate 1 completed step(s)
   [order-B] compensate reserveInventory: ok
   [order-B] aborted

   [order-C] step 3 createShipment: FAILED (address not deliverable: nowhere) -> compensate 2 completed step(s)
   [order-C] compensate chargePayment: ok
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
   [order-D] step 2 chargePayment: ok
   [order-D] step 3 createShipment: ok
   [order-D] completed
```

Every database ends consistent: stock `10 - 2 (A) - 1 (D) = 7`, C refunded, D charged exactly once, B never charged, only A and D shipped:

```
 keyboard |         7

 order-A |  84.00 | charged
 order-C | 126.00 | refunded
 order-D |  42.00 | charged

 order-A | Paris
 order-D | Lyon
```

---

## 07. Transactional outbox, polling relay (`07-outbox-polling/`)

The simplest reliable way to publish events. No Debezium: just a table and a loop.

### Concepts

- **The dual-write problem**: a service must update its database *and* tell other services (publish to Kafka). These are two systems with no shared transaction. Commit then publish: a crash in between loses the event. Publish then commit: a failed commit leaves an event for something that never happened. Retries do not fix this, because the process that would retry is the one that crashed.
- **Outbox table**: instead of publishing, the service inserts the event as a row in `outbox` *in the same transaction* as the business change (`emit()` in `src/app.ts`). One atomic write: both happen or neither does. The app never talks to Kafka.
- **Outbox row shape**: `id` (BIGSERIAL, gives publish order), `event_id` (uuid, the identity consumers dedupe on), `aggregate_id` (becomes the Kafka key, so one order's events stay ordered on one partition), `type`, `payload` (JSONB), `created_at`, `published_at` (null = not yet sent). A partial index on `published_at IS NULL` keeps the poll query cheap as the table grows.
- **Polling publisher (the relay)**: a separate process (`src/relay.ts`) loops: open a transaction, claim up to 10 unpublished rows, send them to Kafka, set `published_at`, commit. It stops when nothing is left (a real relay sleeps and polls again).
- **`FOR UPDATE SKIP LOCKED`**: claiming rows locks them, and other relay instances skip locked rows instead of waiting. You can run several relays for throughput or availability without sending the same row twice concurrently.
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

### Concepts

- **WAL (write-ahead log)**: before Postgres changes a data page, it writes the change to the WAL. The WAL is how Postgres survives crashes and feeds replicas. Every committed change is in it, in commit order.
- **`wal_level=logical`**: by default the WAL holds physical page changes. `logical` adds enough information to decode *row-level* changes (table, columns, values). Set in `docker-compose.yml`.
- **Logical decoding + `pgoutput`**: `pgoutput` is the decoder plugin built into Postgres (no extension needed). It turns WAL records into insert/update/delete messages for the tables listed in a **publication** (`dbz_publication`, created by Debezium).
- **Replication slot**: a named cursor into the WAL (`debezium`). Postgres keeps WAL segments until the slot confirms it has consumed them (`confirmed_flush_lsn`), so the connector can go down and resume without losing changes. Operational catch: an abandoned slot makes WAL pile up on disk.
- **LSN (log sequence number)**: the position of a change in the WAL. It always increases, so it gives a total order.
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
writer: DELETE bob then ROLLBACK (expect no event: WAL only emits committed changes)
writer: DELETE order 1
```

What arrived in Kafka:

```
consumer: INSERT lsn=22142888 tx=734 before=null after={"id":1,...,"status":"pending"}
consumer: UPDATE lsn=22143200 tx=735 before={...,"status":"pending"} after={...,"status":"paid"}
consumer: UPDATE lsn=22143368 tx=736 before={...,"status":"paid"} after={...,"status":"shipped"}
consumer: INSERT lsn=22143488 tx=736 before=null after={"id":2,"customer":"bob",...}
consumer: DELETE lsn=22143808 tx=738 before={...,"status":"shipped"} after=null
```

- The two changes committed together share `tx=736`.
- `tx=737` (DELETE bob + ROLLBACK) never appears, and bob is still in the table.
- The DELETE carries the full `before` row, thanks to `REPLICA IDENTITY FULL`.
- LSNs strictly increase.

The Postgres side of the pipe:

```
logical                                     <- SHOW wal_level

 slot_name |  plugin  | slot_type | active | confirmed_flush_lsn
 debezium  | pgoutput | logical   | t      | 0/151DED8

 pubname         | tablename | attnames
 dbz_publication | orders    | {id,customer,status,total}
```

---

## 09. Transactional outbox, CDC relay (`09-outbox-debezium/`)

Same outbox idea as 07, but the relay is Debezium reading the WAL (08) instead of a polling loop.

### Concepts

- **Log-tailing relay**: instead of polling `outbox`, Debezium reads outbox inserts from the WAL through a replication slot (08). No poll interval, no query load, no `published_at` column to maintain.
- **Outbox row shape** (Debezium's convention): `id` (event id, uuid), `aggregatetype` (routes to the topic), `aggregateid` (becomes the Kafka key, so all events of one order stay ordered on one partition), `type` (event name), `payload` (JSON).
- **EventRouter SMT**: a Kafka Connect transform. It unwraps Debezium's `{before, after, op}` envelope and emits just the payload to `outbox.event.<aggregatetype>`, with the event `id` and `eventType` as headers. Consumers see `OrderPaid {orderId}`, not a row diff.
- **Outbox vs raw CDC**: raw CDC (08) publishes table changes, so consumers couple to your schema and must guess intent. The outbox publishes explicit, versionable business events: the table is private, the event is the public contract.
- **Immediate cleanup**: the outbox row can be deleted in the same transaction it was inserted in. The insert is already in the WAL, so Debezium still publishes it, and EventRouter ignores deletes. The table never grows.
- **At-least-once + idempotent consumer**: same as 07. Debezium can re-send after a restart (it resumes from its last flushed offset), so consumers dedupe on the event `id` header (`seen` set in `src/consumer.ts`).
- **Trade-offs vs 07**: lower latency, no DB polling, no table cleanup, but Kafka Connect, Debezium and a replication slot to run and monitor. Both share the core limit: every write path must remember to emit.

### Proof (`logs/09-outbox-debezium.log`)

The app wrote four outbox rows. One was rolled back (bob), and in step 4 the rest were deleted in the same transaction as the insert. The app also committed carol's order without an outbox row (the dual-write simulation).

```
   outbox <- OrderPlaced id=<alice-placed>
   outbox <- OrderPaid id=<alice-paid>
   outbox <- OrderPlaced id=<bob-placed>
   rejected: payment provider down, order 2 aborted
   outbox <- OrderShipped id=<alice-shipped>
   outbox rows deleted in the same transaction (the WAL still has the inserts)
   order 3 committed to Postgres
   process crashes before producer.send(OrderPlaced) -> nothing will ever publish it
```

Exactly the three committed events arrived, in order, keyed by order id, as business events:

```
consumer: outbox.event.order[0] key=1 eventType=OrderPlaced  id=<alice-placed> payload={"total":"42.50","orderId":1,"customer":"alice"}
consumer: outbox.event.order[0] key=1 eventType=OrderPaid    id=<alice-paid> payload={"orderId":1}
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

## Which one when

- **CRUD + audit (01)**: most apps. You need "who changed what" for compliance or support, and reads of current state dominate.
- **Expand / contract (02)**: any schema change on a system deployed without downtime. It is the default, not an advanced technique.
- **Event sourcing (03)**: the history *is* the domain (ledgers, workflows, bookings). You need to rebuild state, add new read models later, or answer "what did we know at time T".
- **Parallel run (04)**: replacing logic whose exact behavior nobody fully knows (pricing, tax, permissions), before trusting the rewrite.
- **Strangler fig (05)**: replacing a whole system incrementally instead of a big-bang rewrite. It combines naturally with 04 (verify) and 08/09 (move the data).
- **Saga (06)**: a business operation spans services that each own their data.
- **Outbox, polling (07)**: one service needs to reliably tell others that something happened in business terms, without dual writes, with the fewest moving parts. Start here.
- **CDC (08)**: getting changes out of a database into other systems (search index, cache, warehouse) without touching the writing code, when row-level diffs are what the consumer wants.
- **Outbox, CDC relay (09)**: same need as 07, when poll latency, DB load or table cleanup start to hurt, or you already run Debezium.

These combine: a strangler migration verifies with parallel runs and feeds the new service through CDC; a choreographed saga publishes its events through an outbox; an event-sourced service can publish its events through an outbox/CDC relay.
