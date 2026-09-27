# 13-audit-outbox

**Pain: scattered audit logs.** Each service can audit itself in the same transaction (01), but compliance and support need one trail across services, with the actor, that cannot miss a change made through the app or be edited afterwards. Sending it to a central store straight from app code is a dual write that loses events (07).

**Reach for it when** the audit trail of record spans several services and needs the actor and the reason from the app, a guarantee that no change made through the app exists without its audit event, and one central, append-only store.

**Do not reach for it when** there is one service and one database: 01's audit table is enough, with no shipper to run. You need to catch writes that bypass the app (psql, scripts, migrations): run `pgaudit` or triggers alongside this. The central trail must show a change the instant it commits, or in one exact order across services: shipping adds lag, and cross-service order is only as good as the clocks.

01's audit table combined with 07's outbox. Two services (`orders`, `billing`), each with its own Postgres database, write an audit event (actor, reason, before, after) into their own `audit_outbox` in the same transaction as the change. `src/shipper.ts` copies the events into a central `audit` database, where `audit_events` dedupes by `event_id` and a trigger rejects any update or delete.

```sh
docker compose up -d --wait
npm i
npm run setup    # databases orders, billing, audit
npm run demo     # app writes with actors, plus a rolled-back change
npm run ship     # copy outbox rows to the central store (add -- --crash-after-send to simulate a crash)
```

- `src/services.ts` business writes and their audit events, one transaction each.
- `src/shipper.ts` send first, mark shipped second: duplicates possible, loss not.
- Writes that bypass the app (psql, scripts) are not captured; the run shows the gap.

One-shot run with proof: `../run-13-audit-outbox.sh` (log in `../logs/13-audit-outbox.log`). Concepts explained in `../README.md`.
