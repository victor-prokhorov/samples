# cdc-debezium

Change data capture: the app writes to Postgres normally; Debezium tails the WAL through a logical replication slot and publishes one Kafka message per row change (`op`, `before`, `after`, `lsn`, `txId`).

```sh
docker compose up -d --wait
npm i
npm run setup     # create orders table (REPLICA IDENTITY FULL) + register connector
npm run consume   # terminal 1: print change events
npm run write     # terminal 2: insert, update x2, delete
```

- `wal_level=logical` on Postgres, `plugin.name=pgoutput` (built into Postgres, no extension).
- `REPLICA IDENTITY FULL` so updates/deletes carry the full `before` row.
- Topic name: `<topic.prefix>.<schema>.<table>` = `app.public.orders`.
- Connector status: `curl localhost:58083/connectors/orders-connector/status`.

One-shot run with proof: `../run-cdc-debezium.sh` (log in `../logs/cdc-debezium.log`). Concepts explained in `../README.md`.
