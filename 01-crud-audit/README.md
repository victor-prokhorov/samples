# 01-crud-audit

**Pain: lost history.** An `UPDATE` or `DELETE` overwrites the old value, so nobody can later say who changed what, when, or what it was before.

`products` CRUD where each create/update/delete writes an `audit_log` row (`actor`, `action`, `before`, `after` as JSONB) in the same transaction, so an app write and its audit row commit or roll back together.

```sh
docker compose up -d --wait
npm i
npm start
```

- `src/db.ts` schema + `tx` helper.
- `src/products.ts` CRUD + `history(id)`.

Reach for it when most business apps: support or compliance asks who changed what, and reads of current state dominate. One service, one database.

Do not reach for it when the history is the domain and you need to rebuild state or add read models later (03). Writes that bypass the app must be caught too (triggers or `pgaudit`).

One-shot run with proof: `../run-01-crud-audit.sh` (log in `../logs/01-crud-audit.log`). Concepts explained in `../README.md`.
