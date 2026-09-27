# 08-cdc-debezium

**Pain: invasive publishing.** Other systems (search, cache, warehouse) need every change, and making every write path publish is intrusive and misses writes that bypass the app (scripts, manual SQL).

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

When to reach for it: keeping derived copies in sync (search index, cache, warehouse, a new database during a migration), or publishing changes from code you cannot touch. Not the audit log of record: no actor, asynchronous (a lost slot loses changes), no DDL. Use 01's same-transaction audit rows for that.

One-shot run with proof: `../run-08-cdc-debezium.sh` (log in `../logs/08-cdc-debezium.log`). Concepts explained in `../README.md`.
