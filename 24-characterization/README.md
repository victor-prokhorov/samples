# 24-characterization

**Pain: rewriting rules nobody can state.** The contribution calculation lives in a PL/pgSQL function written years ago. The scheme booklet describes it in one sentence, and the code does something else: it truncates instead of rounding, skips the month for members who join after the 15th, caps the salary before the offset instead of after, drops amounts under 10.00, and counts age as days / 365. A rewrite from the booklet differs on half the cases. Without a record of what legacy does, those differences reach members' statements before anyone sees them.

**Reach for it when** you rewrite or refactor logic whose behaviour is only known by running it (calculations, eligibility, pricing, a stored procedure), the logic is deterministic, and you can call it with inputs you choose.

**Do not reach for it when** the rules are already specified and tested: write tests from the spec (23). The legacy output depends on time, randomness or external state you cannot pin. The legacy behaviour is known to be wrong across the board and nobody will keep any of it: a golden master of wrong answers is a list of differences to ignore. You need real traffic rather than generated inputs: run both side by side in production (04).

The legacy function (`sql/legacy.sql`) is loaded into Postgres as found. The demo generates inputs, records the legacy outputs into a committed approval file, runs the TypeScript rewrite against it, explains every mismatch with a rule, and ends with a rewrite that matches legacy except where a documented decision fixes a bug.

```sh
docker compose up -d --wait
npm i
npm run setup    # legacy_monthly_contribution() and the cases table
npm run demo     # inputs, golden master, booklet rewrite, discovered rules, final rewrite, decision table
```

- `sql/legacy.sql` the legacy PL/pgSQL, with its undocumented rules and its leap-year bug.
- `src/inputs.ts` the input generator: boundary values for every threshold (salary cap, offset, minimum amount, 35th and 50th birthdays, join day 15/16, month ends, 29 February) and 1000 cases from a seeded PRNG (mulberry32), so the same inputs come back on every run.
- `src/golden.ts` records legacy outputs (`unnest` insert, one `UPDATE` calling the function) to `approved/legacy.received.tsv`, compares with `approved/legacy.approved.tsv`, and approves on the first run.
- `src/contribution.ts` the rewrite. The booklet version with every rule flag off, and one flag per behaviour learned from legacy. Integer cents throughout.
- `src/decisions.ts` one decision per learned rule: keep the quirk or fix it on purpose, with the reason. The fixes are the allowlist.
- `src/dates.ts` calendar arithmetic: age on a date, month ends, days between.
- `src/demo.ts` the steps: mismatches of the booklet version, the smallest set of rules explaining each, the final check (equal, allowlisted, unexplained), a regression caught, the decision table.
- `approved/legacy.approved.tsv` the golden master (committed). `decision-table.md` the generated decision table.

One-shot run with proof: `../run-24-characterization.sh` (log in `../logs/24-characterization.log`). Concepts explained in `../README.md`.
