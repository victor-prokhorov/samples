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


Reach for it when keeping derived copies in sync with the source of truth: search indexes (Elasticsearch, Meilisearch), cache invalidation, a data warehouse or lake, a new database during a migration (05), or publishing changes from code you cannot change. The consumer wants every row change, including ones made outside the app, and does not care why the row changed.

Do not reach for it when consumers need business intent (`OrderPaid`, not `status pending -> paid`): use an outbox (07, 09), or they couple to your table schema. You want it as the audit log of record, which fails for three reasons. There is no actor: the WAL records the database role, not which user acted. It is asynchronous: a dropped slot or a re-snapshot silently loses changes, while 01's audit row commits with the change. Schema changes are not in it: an `ALTER TABLE` is not decoded, and Debezium skips `TRUNCATE` by default. It is fine as a broad "what changed" history on the side; `pgaudit` is the tool for catching scripts and migrations with the role that ran them.

One-shot run with proof: `../run-08-cdc-debezium.sh` (log in `../logs/08-cdc-debezium.log`). Concepts explained in `../README.md`.
