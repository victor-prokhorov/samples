# 08-cdc-debezium

**Pain: derived data drift.** Search indexes, caches and the warehouse must mirror the database, but dual writes from app code race, fail halfway and miss writes that bypass the app (scripts, manual SQL), while nightly batch copies are hours stale.

**Reach for it when** keeping derived copies in sync with the source of truth: search indexes (Elasticsearch, Meilisearch), cache invalidation, a data warehouse or lake, a new database during a migration (05), or publishing changes from code you cannot change. The consumer wants every row change, including ones made outside the app, and does not care why the row changed.

**Do not reach for it when** consumers need business intent (`OrderPaid`, not `status pending -> paid`): use an outbox (07, 09), or every consumer couples to your table schema. You want the audit log of record: the WAL knows the database role, not the user, and a dropped slot loses the changes made while it was gone, while 01's audit row commits with the change (`pgaudit` catches scripts with their role). Nobody will watch the replication slot: a stalled consumer makes Postgres keep WAL until the disk fills.

Change data capture: the app writes to Postgres normally; Debezium tails the WAL through a logical replication slot and publishes one Kafka message per row change (`op`, `before`, `after`, `lsn`, `txId`).

```sh
docker compose up -d --wait
npm i
npm run setup     # create orders table (REPLICA IDENTITY FULL) + register connector
npm run consume   # terminal 1: print change events
npm run write     # terminal 2: insert, update, tx (update + insert), rolled-back delete, delete
```

- `wal_level=logical` on Postgres, `plugin.name=pgoutput` (built into Postgres, no extension).
- `REPLICA IDENTITY FULL` so updates/deletes carry the full `before` row.
- Topic name: `<topic.prefix>.<schema>.<table>` = `app.public.orders`.
- Connector status: `curl localhost:58083/connectors/orders-connector/status`.

One-shot run with proof: `../run-08-cdc-debezium.sh` (log in `../logs/08-cdc-debezium.log`). Concepts explained in `../README.md`.
