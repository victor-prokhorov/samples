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

One-shot run with proof: `../run-01-crud-audit.sh` (log in `../logs/01-crud-audit.log`). Concepts explained in `../README.md`.
