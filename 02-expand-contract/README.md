# 02-expand-contract

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
