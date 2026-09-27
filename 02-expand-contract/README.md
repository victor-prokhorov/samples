# 02-expand-contract

**Pain: deploy breakage.** Old and new app versions run side by side during a rolling deploy, so a plain `RENAME` breaks whichever one expects the other name.

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

Reach for it when any schema change (rename, split, type change) on a system where old and new app versions, or other readers of the table, run at the same time.

Do not reach for it when you can take downtime, or the app and migration deploy together as one unit (pre-launch, internal tool): the multi-release dance is pure cost. Purely additive changes (a new nullable column) are already safe and need no contract phase.

One-shot run with proof: `../run-02-expand-contract.sh` (log in `../logs/02-expand-contract.log`). Concepts explained in `../README.md`.
