# 12-serializable

**Pain: race conditions.** Concurrent transactions each check a rule ("is stock left?") and each write, so both pass and you oversell. Postgres's default isolation does not stop it.

When SERIALIZABLE is a must and when it is not, on the "never sell more than we have" rule. 20 concurrent buyers compete for 10 items in 8 scenarios. Each one reports what the buyers were told and what the database recorded, and exits 1 if a scenario does not end as expected.

```sh
docker compose up -d --wait
npm i
npm run setup   # products (stock counter), events (capacity), tickets (UNIQUE (event_id, seat))
npm run demo    # lost update, 3 cheaper fixes, write skew under RC and RR, SERIALIZABLE + retry, parent row lock
```

- `src/db.ts` `tx()` with an explicit isolation level, `withRetry()` on SQLSTATE 40001/40P01, `race()` (N pre-connected clients started together).
- `src/demo.ts` each scenario. A `pg_sleep(0.1)` between the check and the write widens the race window so every run shows the same outcome.

One-shot run with proof: `../run-12-serializable.sh` (log in `../logs/12-serializable.log`). Concepts explained in `../README.md`.
