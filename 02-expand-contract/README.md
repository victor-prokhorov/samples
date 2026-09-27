# 02-expand-contract

**Pain: deploy breakage.** During a rolling deploy or a rollback, old and new app versions run against the same schema, so a plain `RENAME` or type change breaks whichever version expects the other shape.

**Reach for it when** you change a schema (rename, split, type change) on a system where old and new app versions, or other readers of the table, run at the same time.

**Do not reach for it when** you can take downtime, or the app and schema deploy as one unit with no other readers (pre-launch, internal tool): the multi-release dance is pure cost. The change is purely additive (a new nullable column): it is already backward compatible and needs no contract phase. Nobody will schedule the contract step: a half-done migration leaves two columns and the write-both code in place forever.

Zero-downtime rename of `users.name` to `display_name`. Four app versions (`src/versions.ts`) and four migrations; in every phase the two versions that overlap during a rolling deploy both keep working. Also shows the naive `RENAME` breaking v1, a premature read switch, and a premature contract.

```sh
docker compose up -d --wait
npm i
npm start
```

| Phase | Migration | Versions running |
| --- | --- | --- |
| 1 expand | add `display_name`, drop `NOT NULL` on `name` | v1 + v2 |
| 2 migrate | backfill `display_name` | v2 |
| 3 switch reads | none | v2 + v3 |
| 4 stop old writes | `display_name SET NOT NULL` | v3 + v4 |
| 5 contract | drop `name` | v4 |

One-shot run with proof: `../run-02-expand-contract.sh` (log in `../logs/02-expand-contract.log`). Concepts explained in `../README.md`.
