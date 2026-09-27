# 06-saga

**Pain: partial failure.** Each service owns its database, so no transaction covers the whole order. A failure halfway leaves stock reserved and money taken for an order that will never ship.

**Reach for it when** one business operation spans services that each own their data, including long-running flows that wait (06's timer).

**Do not reach for it when** the data lives in one database: use a transaction. A step cannot be compensated and must be atomic with another: redesign the boundary instead. The flow has many branches, waits and human steps: use a workflow engine (Temporal) rather than a hand-rolled step table. Splitting a service that needs strong consistency, then patching it with sagas, is the classic antipattern.

Orchestrated saga across three services, each with its own Postgres database (`inventory`, `payments`, `shipping`) plus the orchestrator's saga log (`orchestrator`). Steps: reserve stock, charge, ship; compensations: release, refund. Every step is idempotent by saga id, so recovery can safely re-run it. A `fraudHold` timer step parks a saga in the log (`state = 'waiting'`, `wake_at`) instead of blocking a process; a separate waker polls and resumes it. Services are in-process functions standing in for remote microservices; each call logs `-> HTTP`.

```sh
docker compose up -d --wait
npm i
npm run setup    # create the 4 databases and tables, stock = 10
npm run demo     # happy path, payment failure, shipping failure, then a crash mid-saga (exit 1)
npm run resume   # new process: reload unfinished sagas from the log and finish them
npm run timer    # start order-E with a 30s hold; it parks as a row and the process exits
npm run waker    # poll every 5s, wake due sagas, exit when none is waiting
```

- `src/orchestrator.ts` step table, forward loop, compensation loop, saga log updates.
- `src/services.ts` the three services' local transactions and compensations.
- `src/waker.ts` the poller that claims due sagas and resumes them.

One-shot run with proof: `../run-06-saga.sh` (log in `../logs/06-saga.log`). Concepts explained in `../README.md`.
