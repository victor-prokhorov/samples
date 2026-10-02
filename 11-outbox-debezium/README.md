# 11-outbox-debezium

**Pain: polling overhead.** 09's relay adds poll latency and query load, and its outbox table keeps growing until something cleans it up.

**Reach for it when** you have 09's need and poll latency, query load or table cleanup start to hurt, or Debezium is already running for 10.

**Do not reach for it when** nobody is ready to run Kafka Connect and watch a replication slot: 09 is enough for most volumes. You would delete outbox rows at once but cannot afford to lose an event: a dropped slot then loses them for good, so keep rows until shipped and poll them, as 17 does.

Transactional outbox with a CDC relay (the log-tailing version of `09-outbox-polling`). The app writes the business row and an `outbox` row in one Postgres transaction. Debezium tails the WAL, and its `EventRouter` transform turns each outbox insert into a business event on `outbox.event.<aggregatetype>`.

```sh
docker compose up -d --wait
npm i
npm run setup     # orders + outbox tables, register connector with EventRouter
npm run consume   # terminal 1
npm run app       # terminal 2
```

- `src/app.ts` `emit()` inserts into `outbox` inside the caller's transaction.
- `src/setup.ts` connector: `table.include.list=public.outbox`, `transforms=outbox` (EventRouter), payload JSON expanded, `type` put in the `eventType` header.
- `src/consumer.ts` dedupes by the `id` header (delivery is at-least-once).

One-shot run with proof: `../run-11-outbox-debezium.sh` (log in `../logs/11-outbox-debezium.log`). Concepts explained in `../README.md`.
