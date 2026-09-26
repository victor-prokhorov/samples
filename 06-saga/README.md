# 06-saga

Orchestrated saga across three services, each with its own Postgres database (`inventory`, `payments`, `shipping`) plus the orchestrator's saga log (`orchestrator`). Steps: reserve stock, charge, ship; compensations: release, refund. Every step is idempotent by saga id, so recovery can safely re-run it.

```sh
docker compose up -d --wait
npm i
npm run setup    # create the 4 databases and tables, stock = 10
npm run demo     # happy path, payment failure, shipping failure, then a crash mid-saga (exit 1)
npm run resume   # new process: reload unfinished sagas from the log and finish them
```

- `src/orchestrator.ts` step table, forward loop, compensation loop, saga log updates.
- `src/services.ts` the three services' local transactions and compensations.

One-shot run with proof: `../run-06-saga.sh` (log in `../logs/06-saga.log`). Concepts explained in `../README.md`.
