# 03-event-sourcing

**Pain: state without its story.** A current-state table forgets how it got there, and a separate audit log (01) can drift from it. Here the history is the state.

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
