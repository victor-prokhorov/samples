# samples

Five minimal, real TypeScript + Postgres examples of ways to keep track of change and publish it, numbered by complexity. Read them in order: each one assumes the concepts of the ones before it. For the wider landscape (strangler fig, expand/contract, sagas, who coined what, and which books to read) see [MIGRATION-PATTERNS.md](MIGRATION-PATTERNS.md).

| # | Folder | New concepts | Infra | Run | Proof |
| --- | --- | --- | --- | --- | --- |
| 01 | [`01-crud-audit/`](01-crud-audit/) | transactions, before/after audit rows | Postgres | `./run-01-crud-audit.sh` | [`logs/01-crud-audit.log`](logs/01-crud-audit.log) |
| 02 | [`02-event-sourcing/`](02-event-sourcing/) | events as source of truth, fold, optimistic concurrency, projections | Postgres | `./run-02-event-sourcing.sh` | [`logs/02-event-sourcing.log`](logs/02-event-sourcing.log) |
| 03 | [`03-outbox-polling/`](03-outbox-polling/) | dual-write problem, outbox table, polling relay, `SKIP LOCKED`, at-least-once, idempotent consumer | Postgres, Kafka | `./run-03-outbox-polling.sh` | [`logs/03-outbox-polling.log`](logs/03-outbox-polling.log) |
| 04 | [`04-cdc-debezium/`](04-cdc-debezium/) | WAL, logical decoding, replication slot, LSN, Debezium, Kafka Connect | Postgres, Kafka, Connect | `./run-04-cdc-debezium.sh` | [`logs/04-cdc-debezium.log`](logs/04-cdc-debezium.log) |
| 05 | [`05-outbox-debezium/`](05-outbox-debezium/) | outbox relayed by CDC, EventRouter, immediate cleanup | Postgres, Kafka, Connect | `./run-05-outbox-debezium.sh` | [`logs/05-outbox-debezium.log`](logs/05-outbox-debezium.log) |

Each script starts from a fresh database (`docker compose down -v && up`), installs deps, runs the demo, then dumps the raw tables as proof. Everything it prints goes to `logs/<name>.log`. Needs Docker and Node 22.

Ports (chosen to avoid clashing with other local Postgres instances):

| # | Postgres | Kafka | Kafka Connect |
| --- | --- | --- | --- |
| 01 | 55434 | | |
| 02 | 55433 | | |
| 03 | 55437 | 59094 | |
| 04 | 55435 | 59092 | 58083 |
| 05 | 55436 | 59093 | 58084 |

---

## 01. CRUD with audit log (`01-crud-audit/`)

### Concepts

- **CRUD**: the table holds only the *current* state. `UPDATE` overwrites, `DELETE` erases. On its own, the database cannot tell you what a row looked like yesterday or who changed it.
- **Audit log**: a second, append-only table. Every write adds one row: `entity`, `entity_id`, `action` (create/update/delete), `actor`, `before` and `after` snapshots as JSONB, and `at`.
- **Same transaction**: the data change and its audit row are committed together (`tx()` in `src/db.ts`). Either both exist or neither does. That is what makes the log trustworthy. If you write the audit afterwards, a crash between the two leaves a silent gap.
- **Capturing `before`**: an update first runs `SELECT ... FOR UPDATE`. That locks the row, so no concurrent writer can change it between reading `before` and writing `after`.
- **Trade-off**: the audit is only as complete as the code paths that call it. A manual `psql` UPDATE or another service writing the same table bypasses it. The alternatives are DB triggers (catch every writer) and CDC (04, reads the WAL). The audit also stores snapshots, not intent: it says the price went 49 -> 39, not *why*.

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

## 02. Event sourcing (`02-event-sourcing/`)

### Concepts

- **Events are the source of truth**: there is no `accounts` table. The `events` table stores facts in the past tense (`AccountOpened`, `MoneyDeposited`, `MoneyWithdrawn`). Rows are only ever inserted, never updated or deleted.
- **Stream**: all events of one aggregate (one account), keyed by `stream_id`, ordered by `version` 1, 2, 3...
- **Rehydrate / fold**: current state = `events.reduce(evolve, initial)` (`src/account.ts`). `evolve` is a pure function `(state, event) -> state`.
- **Command -> decide -> append**: a command (`withdraw 30`) loads the stream, rebuilds state, checks invariants (enough balance?), and returns *new events*. Only those events are persisted. A rejected command writes nothing.
- **Optimistic concurrency**: the writer says "I decided based on version N", so its events get versions N+1, N+2... `UNIQUE (stream_id, version)` makes a second writer that also read N fail with `ConcurrencyError`. That writer reloads and retries. No locks are held while deciding.
- **Time travel**: state at any past point = fold a prefix of the stream.
- **Projections / read models**: new views (a balance table, a "total deposited" report, a search index) are built by replaying the events. They can be thrown away and rebuilt at any time, including views nobody thought of when the events were written.
- **Trade-offs**: queries across aggregates need projections, events are forever (so schema evolution/upcasting matters), and long streams need snapshots to stay fast. `global_position` gives a total order for projection builders to follow.

### Proof (`logs/02-event-sourcing.log`)

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

## 03. Transactional outbox, polling relay (`03-outbox-polling/`)

The simplest reliable way to publish events. No Debezium: just a table and a loop.

### Concepts

- **The dual-write problem**: a service must update its database *and* tell other services (publish to Kafka). These are two systems with no shared transaction. Commit then publish: a crash in between loses the event. Publish then commit: a failed commit leaves an event for something that never happened. Retries do not fix this, because the process that would retry is the one that crashed.
- **Outbox table**: instead of publishing, the service inserts the event as a row in `outbox` *in the same transaction* as the business change (`emit()` in `src/app.ts`). One atomic write: both happen or neither does. The app never talks to Kafka.
- **Outbox row shape**: `id` (BIGSERIAL, gives publish order), `event_id` (uuid, the identity consumers dedupe on), `aggregate_id` (becomes the Kafka key, so one order's events stay ordered on one partition), `type`, `payload` (JSONB), `created_at`, `published_at` (null = not yet sent). A partial index on `published_at IS NULL` keeps the poll query cheap as the table grows.
- **Polling publisher (the relay)**: a separate process (`src/relay.ts`) loops: open a transaction, claim up to 10 unpublished rows, send them to Kafka, set `published_at`, commit. It stops when nothing is left (a real relay sleeps and polls again).
- **`FOR UPDATE SKIP LOCKED`**: claiming rows locks them, and other relay instances skip locked rows instead of waiting. You can run several relays for throughput or availability without sending the same row twice concurrently.
- **At-least-once delivery**: the send to Kafka and the `published_at` update cannot be atomic either. If the relay crashes after sending and before committing, the rows stay unpublished and are sent again on restart. Duplicates are possible; loss is not. The relay's order is deliberate: send first, mark second.
- **Idempotent consumer**: because of the above, consumers must dedupe. `src/consumer.ts` remembers processed `event_id`s and skips repeats. In real code that set is a `processed_events` table, updated in the same transaction as the consumer's own side effects.
- **Trade-offs vs 05 (CDC relay)**: polling is simple (Postgres + any broker, no Connect, no replication slot), but it adds latency (the poll interval), load on the DB, and a growing table you must clean up (delete or partition published rows). 05 removes all three at the cost of Debezium.

### Proof (`logs/03-outbox-polling.log`)

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
consumer: OrderPlaced key=1 event_id=9ec50f01-... payload={"total":"42.50","orderId":1,"customer":"alice"}
consumer: OrderPaid key=1 event_id=b2dd7bf9-... payload={"orderId":1}
consumer: DUPLICATE OrderPlaced event_id=9ec50f01-... skipped (idempotent consumer)
consumer: DUPLICATE OrderPaid event_id=b2dd7bf9-... skipped (idempotent consumer)
```

---

## 04. CDC: WAL -> Debezium -> Kafka (`04-cdc-debezium/`)

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

### Proof (`logs/04-cdc-debezium.log`)

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

## 05. Transactional outbox, CDC relay (`05-outbox-debezium/`)

Same outbox idea as 03, but the relay is Debezium reading the WAL (04) instead of a polling loop.

### Concepts

- **Log-tailing relay**: instead of polling `outbox`, Debezium reads outbox inserts from the WAL through a replication slot (04). No poll interval, no query load, no `published_at` column to maintain.
- **Outbox row shape** (Debezium's convention): `id` (event id, uuid), `aggregatetype` (routes to the topic), `aggregateid` (becomes the Kafka key, so all events of one order stay ordered on one partition), `type` (event name), `payload` (JSON).
- **EventRouter SMT**: a Kafka Connect transform. It unwraps Debezium's `{before, after, op}` envelope and emits just the payload to `outbox.event.<aggregatetype>`, with the event `id` and `eventType` as headers. Consumers see `OrderPaid {orderId}`, not a row diff.
- **Outbox vs raw CDC**: raw CDC (04) publishes table changes, so consumers couple to your schema and must guess intent. The outbox publishes explicit, versionable business events: the table is private, the event is the public contract.
- **Immediate cleanup**: the outbox row can be deleted in the same transaction it was inserted in. The insert is already in the WAL, so Debezium still publishes it, and EventRouter ignores deletes. The table never grows.
- **At-least-once + idempotent consumer**: same as 03. Debezium can re-send after a restart (it resumes from its last flushed offset), so consumers dedupe on the event `id` header (`seen` set in `src/consumer.ts`).
- **Trade-offs vs 03**: lower latency, no DB polling, no table cleanup, but Kafka Connect, Debezium and a replication slot to run and monitor. Both share the core limit: every write path must remember to emit.

### Proof (`logs/05-outbox-debezium.log`)

The app wrote four outbox rows. One was rolled back (bob), and in step 4 the rest were deleted in the same transaction as the insert. The app also committed carol's order without an outbox row (the dual-write simulation).

```
   outbox <- OrderPlaced id=302d06e7-...          (alice)
   outbox <- OrderPaid id=96e0094d-...
   outbox <- OrderPlaced id=99cbb369-...          (bob)
   rejected: payment provider down, order 2 aborted
   outbox <- OrderShipped id=22a2891e-...
   outbox rows deleted in the same transaction (the WAL still has the inserts)
   order 3 committed to Postgres
   process crashes before producer.send(OrderPlaced) -> nothing will ever publish it
```

Exactly the three committed events arrived, in order, keyed by order id, as business events:

```
consumer: outbox.event.order[0] key=1 eventType=OrderPlaced  id=302d06e7-... payload={"total":"42.50","orderId":1,"customer":"alice"}
consumer: outbox.event.order[0] key=1 eventType=OrderPaid    id=96e0094d-... payload={"orderId":1}
consumer: outbox.event.order[0] key=1 eventType=OrderShipped id=22a2891e-... payload={"carrier":"UPS","orderId":1}
```

- bob's rolled-back `OrderPlaced` (`99cbb369`) never arrived, and bob has no order row.
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

- **CRUD + audit**: most apps. You need "who changed what" for compliance or support, and reads of current state dominate.
- **Event sourcing**: the history *is* the domain (ledgers, workflows, bookings). You need to rebuild state, add new read models later, or answer "what did we know at time T".
- **CDC**: getting changes out of a database into other systems (search index, cache, warehouse) without touching the writing code, when row-level diffs are what the consumer wants.
- **Outbox, polling (03)**: one service needs to reliably tell others that something happened in business terms, without dual writes, and you want the fewest moving parts. Start here.
- **Outbox, CDC relay (05)**: same need, when poll latency, DB load or table cleanup start to hurt, or you already run Debezium. It is CDC applied to a table designed as a public event contract.

These combine: an event-sourced service can publish its events via an outbox/CDC relay, and CRUD + audit can sit alongside an outbox in the same transaction.
