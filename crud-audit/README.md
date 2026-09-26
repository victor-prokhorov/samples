# crud-audit

`products` CRUD where each create/update/delete writes an `audit_log` row (`actor`, `action`, `before`, `after` as JSONB) in the same transaction, so the log can never drift from the data.

```sh
docker compose up -d --wait
npm i
npm start
```

- `src/db.ts` schema + `tx` helper.
- `src/products.ts` CRUD + `history(id)`.

One-shot run with proof: `../run-crud-audit.sh` (log in `../logs/crud-audit.log`). Concepts explained in `../README.md`.
