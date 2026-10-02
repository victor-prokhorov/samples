# 16-serializable

**Pain: write skew.** Concurrent transactions each check a rule over several rows ("fewer than 10 tickets sold?", "someone else still on call?"), each write a different row, and all commit, so the rule breaks. Postgres's default READ COMMITTED, and even REPEATABLE READ, let it through.

**Reach for it when** an invariant spans several rows or depends on rows that do not exist yet (capacity, overbooking, on-call rules) and cannot be a constraint or a lock on one parent row, or when there are too many such rules to find and guard each one by hand.

**Do not reach for it when** the rule is about one row, or is uniqueness or no overlap: a conditional `UPDATE`, `FOR UPDATE` or a constraint (`UNIQUE`, `EXCLUDE`) is enough. The app cannot retry the whole transaction on `40001`: SERIALIZABLE then turns races into errors users see. Many writers hit the same hot spot: aborts and retries pile up, so lock the parent row instead (scenario 8). Some writers of those tables would stay at READ COMMITTED: SSI only protects transactions that all run SERIALIZABLE.

When SERIALIZABLE is a must and when it is not, on the "never sell more than we have" rule. 20 concurrent buyers compete for 10 items in 8 scenarios. Each one reports what the buyers were told and what the database recorded, and exits 1 if a scenario does not end as expected.

```sh
docker compose up -d --wait
npm i
npm run setup   # products (stock counter), events (capacity), tickets (UNIQUE (event_id, seat))
npm run demo    # lost update, 3 cheaper fixes, write skew under RC and RR, SERIALIZABLE + retry, parent row lock
```

- `src/db.ts` `tx()` with an explicit isolation level, `withRetry()` on SQLSTATE 40001/40P01, `race()` (N pre-connected clients started together).
- `src/demo.ts` each scenario. A `pg_sleep(0.1)` between the check and the write widens the race window so every run shows the same outcome.

One-shot run with proof: `../run-16-serializable.sh` (log in `../logs/16-serializable.log`). Concepts explained in `../README.md`.
