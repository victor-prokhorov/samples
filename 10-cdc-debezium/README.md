# 10. CDC: WAL -> Debezium -> Kafka

**Pain: derived data drift.** Search indexes, caches and the warehouse must mirror the database, but dual writes from app code race, fail halfway and miss writes that bypass the app (scripts, manual SQL), while nightly batch copies are hours stale.

**Reach for it when** keeping derived copies in sync with the source of truth: search indexes (Elasticsearch, Meilisearch), cache invalidation, a data warehouse or lake, a new database during a migration (05), or publishing changes from code you cannot change. The consumer wants every row change, including ones made outside the app, and does not care why the row changed.

**Do not reach for it when** consumers need business intent (`OrderPaid`, not `status pending -> paid`): use an outbox (09, 11), or every consumer couples to your table schema. You want the audit log of record: the WAL knows the database role, not the user, and a dropped slot loses the changes made while it was gone, while 01's audit row commits with the change (`pgaudit` catches scripts with their role). Nobody will watch the replication slot: a stalled consumer makes Postgres keep WAL until the disk fills.

Change data capture: the app writes to Postgres normally; Debezium tails the WAL through a logical replication slot and publishes one Kafka message per row change (`op`, `before`, `after`, `lsn`, `txId`).

## Run

One shot with proof: `./run-10-cdc-debezium.sh` from the repo root (log in [`../logs/10-cdc-debezium.log`](../logs/10-cdc-debezium.log)).

By hand, from this folder (ports: Postgres 55435, Kafka 59092, Kafka Connect 58083):

```sh
docker compose up -d --wait
npm i
npm run setup     # create orders table (REPLICA IDENTITY FULL) + register connector
npm run consume   # terminal 1: print change events
npm run write     # terminal 2: insert, update, tx (update + insert), rolled-back delete, delete
```

## Files

- `wal_level=logical` on Postgres, `plugin.name=pgoutput` (built into Postgres, no extension).
- `REPLICA IDENTITY FULL` so updates/deletes carry the full `before` row.
- Topic name: `<topic.prefix>.<schema>.<table>` = `app.public.orders`.
- Connector status: `curl localhost:58083/connectors/orders-connector/status`.

## Concepts

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

## Proof (`logs/10-cdc-debezium.log`)

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

## Origins and further reading

- Article: "Pattern: Transaction log tailing", Chris Richardson, microservices.io. https://microservices.io/patterns/data/transaction-log-tailing.html
- Talk: "Turning the database inside out with Apache Samza", Martin Kleppmann, Strange Loop 2014. https://www.youtube.com/watch?v=fU9hR3kiOK0 (transcript: https://martin.kleppmann.com/2015/03/04/turning-the-database-inside-out.html)
- Talk: "Change Data Streaming Patterns in Distributed Systems", Gunnar Morling, 2021. https://www.youtube.com/watch?v=CLv2EcYnr2g
- Book: *Designing Data-Intensive Applications*, Martin Kleppmann, 2017 (logs, CDC, derived data). https://dataintensive.net/
