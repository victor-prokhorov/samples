# outbox

Transactional outbox. The app writes the business row and an `outbox` row in one Postgres transaction. Debezium tails the WAL, and its `EventRouter` transform turns each outbox insert into a business event on `outbox.event.<aggregatetype>`.

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

One-shot run with proof: `../run-outbox.sh` (log in `../logs/outbox.log`). Concepts explained in `../README.md`.
