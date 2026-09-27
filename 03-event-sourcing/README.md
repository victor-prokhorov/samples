# 03-event-sourcing

**Pain: lost business history.** A current-state table keeps only the latest values, so what happened (`MoneyWithdrawn`, `OrderCancelled`) and in what order is gone. An audit log beside it (01) records snapshots, not intent, and is not the source of truth, so nothing guarantees it replays into the current state.

**Reach for it when** the history is the domain (ledgers, bookings, workflows) and you need to rebuild state, answer "what was it at time T", or build new read models from events already stored.

**Do not reach for it when** the domain is plain CRUD and you only need to know who changed what: 01 is far cheaper. You would apply it to a whole system by default: every event schema is a contract you version forever, and every current-state query needs a projection that lags the write. You want it as the way services talk to each other: publish separate integration events through an outbox (07) instead of exposing the event store.

Bank account aggregate. Commands (`open`, `deposit`, `withdraw`) validate against state rebuilt from events and return new events. Nothing is updated in place.

```sh
docker compose up -d --wait
npm i
npm start
```

- `src/store.ts` event store: `append(streamId, expectedVersion, events)`, `readStream`. A stale `expectedVersion` hits the unique constraint -> `ConcurrencyError`.
- `src/account.ts` events, `evolve` (fold), command handlers.
- `src/index.ts` demo: happy path, rejected withdrawal, concurrent-write conflict, retry that re-decides on conflict, time travel by date (`readStream(id, before)`), a projection (total deposited).

One-shot run with proof: `../run-03-event-sourcing.sh` (log in `../logs/03-event-sourcing.log`). Concepts explained in `../README.md`.
