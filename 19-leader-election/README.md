# 19-leader-election

**Pain: a job that fires N times, or a single point of failure.** Run three replicas of a cron-like scheduler and each one fires: three emails, three charges, three reports. Run one and it is a single point of failure. Work that must stay in order, like 09's relay, cannot simply be shared out either.

**Reach for it when** exactly one instance among several should do a piece of work at a time (a cron-like scheduler, a relay that must keep per-aggregate order, a partition owner), and you already run Postgres or a coordination service.

**Do not reach for it when** the work can be split instead: let every replica claim its own rows (09's relay with `FOR UPDATE SKIP LOCKED` when order does not matter, 08's waker with a conditional `UPDATE`), which scales and needs no leader. Two instances briefly overlapping would corrupt something that cannot check a fencing token: fix the storage side first, since no lease alone guarantees one leader. Consensus itself (replicated state, not just who leads) is the need: use etcd, ZooKeeper or Consul, never a hand-rolled protocol. Each run can claim itself: insert a `(job, scheduled_slot)` row under a unique key and let the replicas that lose the insert skip, so overlap is harmless and no leader is needed. A few seconds of outage are acceptable: one replica under a supervisor that restarts it costs about what a lease failover (the TTL) costs, with nothing to elect.

Three real OS processes (`src/replica.ts`, spawned by the run script) compete for one row in a `leases` table. The holder runs the job (a row in `ticks` every second); the run script kills it, pauses it with `SIGSTOP` and stops it gracefully, and the followers take over. Every acquisition bumps a `term`, which `fenced_ticks` checks as a fencing token. `src/advisory.ts` shows the session-based alternative, `pg_try_advisory_lock`.

```sh
docker compose up -d --wait
npm i
npm run setup                  # leases, ticks, fenced_ticks and its fencing trigger
npm run replica -- a           # run in 3 terminals with a, b, c; kill, pause (kill -STOP / -CONT) and stop them
npm run advisory -- hold       # hold pg_try_advisory_lock(18) in this session
npm run advisory -- take 4000  # try for 4s from another session
npm run advisory -- pooler     # session lock vs transaction lock behind a pool
```

- `src/replica.ts` the lease statement (acquire, renew or bump the term, on the database clock), the self-fencing check, the job, release on SIGTERM. `SIGUSR2` and `SIGUSR1` make it stop itself right after its next renew or right after its lease check, so the pause lands at an exact spot.
- `src/setup.ts` the `check_fencing_token` trigger: `fenced_ticks` rejects a term lower than the highest it has seen.
- `src/narrate.ts` (`npm run step`) prints the `## N. title` and `concept:` header for each step of the run script.
- `src/advisory.ts` session lock held, paused, killed; unlock on the wrong pooled connection; `pg_try_advisory_xact_lock`.

One-shot run with proof: `../run-19-leader-election.sh` (log in `../logs/19-leader-election.log`). Concepts explained in `../README.md`.
