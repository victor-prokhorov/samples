# samples

Four minimal, real TypeScript + Postgres examples of ways to keep track of change and publish it:

| Folder | Source of truth | History comes from | Run |
| --- | --- | --- | --- |
| `crud-audit/` | current rows in `products` | `audit_log` rows written by the app | `./run-crud-audit.sh` |
| `event-sourcing/` | append-only `events` table | the events themselves; state is derived | `./run-event-sourcing.sh` |
| `cdc-debezium/` | current rows in `orders` | Postgres WAL, streamed by Debezium into Kafka | `./run-cdc-debezium.sh` |
| `outbox/` | current rows in `orders` | `outbox` rows written in the same tx, published by Debezium | `./run-outbox.sh` |

Each script starts from a fresh database (`docker compose down -v && up`), installs deps, runs the demo, then dumps the raw tables as proof. Everything it prints goes to `logs/<name>.log`. Needs Docker and Node 22.

Ports (chosen to avoid clashing with other local Postgres instances): event-sourcing pg `55433`, crud-audit pg `55434`, cdc pg `55435` / Kafka `59092` / Connect `58083`, outbox pg `55436` / Kafka `59093` / Connect `58084`.

---

## 1. CRUD with audit log (`crud-audit/`)

### Concepts

- **CRUD**: the table holds only the *current* state. `UPDATE` overwrites, `DELETE` erases. On its own, the database cannot tell you what a row looked like yesterday or who changed it.
- **Audit log**: a second, append-only table. Every write adds one row: `entity`, `entity_id`, `action` (create/update/delete), `actor`, `before` and `after` snapshots as JSONB, and `at`.
- **Same transaction**: the data change and its audit row are committed together (`tx()` in `src/db.ts`). Either both exist or neither does. That is what makes the log trustworthy. If you write the audit afterwards, a crash between the two leaves a silent gap.
- **Capturing `before`**: an update first runs `SELECT ... FOR UPDATE`. That locks the row, so no concurrent writer can change it between reading `before` and writing `after`.
- **Trade-off**: the audit is only as complete as the code paths that call it. A manual `psql` UPDATE or another service writing the same table bypasses it. The alternatives are DB triggers (catch every writer) and CDC (section 3, reads the WAL). The audit also stores snapshots, not intent: it says the price went 49 -> 39, not *why*.

### Proof (`logs/crud-audit.log`)

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

## 2. Event sourcing (`event-sourcing/`)

### Concepts

- **Events are the source of truth**: there is no `accounts` table. The `events` table stores facts in the past tense (`AccountOpened`, `MoneyDeposited`, `MoneyWithdrawn`). Rows are only ever inserted, never updated or deleted.
- **Stream**: all events of one aggregate (one account), keyed by `stream_id`, ordered by `version` 1, 2, 3...
- **Rehydrate / fold**: current state = `events.reduce(evolve, initial)` (`src/account.ts`). `evolve` is a pure function `(state, event) -> state`.
- **Command -> decide -> append**: a command (`withdraw 30`) loads the stream, rebuilds state, checks invariants (enough balance?), and returns *new events*. Only those events are persisted. A rejected command writes nothing.
- **Optimistic concurrency**: the writer says "I decided based on version N", so its events get versions N+1, N+2... `UNIQUE (stream_id, version)` makes a second writer that also read N fail with `ConcurrencyError`. That writer reloads and retries. No locks are held while deciding.
- **Time travel**: state at any past point = fold a prefix of the stream.
- **Projections / read models**: new views (a balance table, a "total deposited" report, a search index) are built by replaying the events. They can be thrown away and rebuilt at any time, including views nobody thought of when the events were written.
- **Trade-offs**: queries across aggregates need projections, events are forever (so schema evolution/upcasting matters), and long streams need snapshots to stay fast. `global_position` gives a total order for projection builders to follow.

### Proof (`logs/event-sourcing.log`)

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

## 3. CDC: WAL -> Debezium -> Kafka (`cdc-debezium/`)

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

### Proof (`logs/cdc-debezium.log`)

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

## 4. Transactional outbox (`outbox/`)

### Concepts

- **The dual-write problem**: a service must update its database *and* tell other services (publish to Kafka). These are two systems with no shared transaction. Commit then publish: a crash in between loses the event. Publish then commit: a failed commit leaves an event for something that never happened. Retries do not fix this, because the process that would retry is the one that crashed.
- **Outbox table**: instead of publishing, the service inserts the event as a row in an `outbox` table *in the same transaction* as the business change. Now there is a single atomic write: both happen or neither does.
- **Relay**: something else moves outbox rows to the broker. Here that is Debezium reading the WAL (log-tailing relay). The other common option is a poller that runs `SELECT ... FROM outbox WHERE published = false`, which is simpler but adds latency and DB load.
- **Outbox row shape** (Debezium's convention): `id` (event id, uuid), `aggregatetype` (routes to the topic), `aggregateid` (becomes the Kafka key, so all events of one order stay ordered on one partition), `type` (event name), `payload` (JSON).
- **EventRouter SMT**: a Kafka Connect transform. It unwraps Debezium's `{before, after, op}` envelope and emits just the payload to `outbox.event.<aggregatetype>`, with the event `id` and `eventType` as headers. Consumers see `OrderPaid {orderId}`, not a row diff.
- **Outbox vs raw CDC**: raw CDC (section 3) publishes table changes, so consumers couple to your schema and must guess intent. The outbox publishes explicit, versionable business events: the table is private, the event is the public contract.
- **Immediate cleanup**: the outbox row can be deleted in the same transaction it was inserted in. The insert is already in the WAL, so Debezium still publishes it, and EventRouter ignores deletes. The table never grows.
- **At-least-once + idempotent consumer**: the relay can re-send after a restart (it resumes from its last flushed offset). Consumers dedupe on the event `id` header (`seen` set in `src/consumer.ts`, a processed-ids table in real code).
- **Trade-offs**: every write path must remember to emit, events are eventually delivered (not synchronously), and the Kafka + Connect infrastructure is the same as for CDC.

### Proof (`logs/outbox.log`)

The app wrote four outbox rows. One was rolled back (bob), and in step 4 the rest were deleted in the same transaction as the insert. The app also committed carol's order without an outbox row (the dual-write simulation).

```
   outbox <- OrderPlaced id=3f6a879d-...          (alice)
   outbox <- OrderPaid id=2c7c9cd0-...
   outbox <- OrderPlaced id=2bbe6fb6-...          (bob)
   rejected: payment provider down, order 2 aborted
   outbox <- OrderShipped id=6a240ce1-...
   outbox rows deleted in the same transaction (the WAL still has the inserts)
   order 3 committed to Postgres
   process crashes before producer.send(OrderPlaced) -> nothing will ever publish it
```

Exactly the three committed events arrived, in order, keyed by order id, as business events:

```
consumer: outbox.event.order[0] key=1 eventType=OrderPlaced  id=3f6a879d-... payload={"total":"42.50","orderId":1,"customer":"alice"}
consumer: outbox.event.order[0] key=1 eventType=OrderPaid    id=2c7c9cd0-... payload={"orderId":1}
consumer: outbox.event.order[0] key=1 eventType=OrderShipped id=6a240ce1-... payload={"carrier":"UPS","orderId":1}
```

- bob's rolled-back `OrderPlaced` (`2bbe6fb6`) never arrived, and bob has no order row.
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
- **Outbox**: one service needs to reliably tell other services that something happened in business terms, without dual writes. It is CDC applied to a table designed as a public event contract.

These combine: an event-sourced service can publish its events via an outbox/CDC relay, and CRUD + audit can sit alongside an outbox in the same transaction.
