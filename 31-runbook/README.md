# 31-runbook

**Pain: operations that live in one person's head.** The release goes fine when the person who always does it is in; when they are away, the backup is skipped, the migration runs after the restart, and nobody knows how to go back. The wiki page describing the monthly data load drifted from what people actually type. A new team member cannot tell a deliberate decision from an accident, so they undo it or are afraid to touch it.

**Reach for it when** a small team runs a service: releases, data loads, member requests and rollbacks are repeated by different people, some steps need a human, and every run should leave a record.

**Do not reach for it when** the procedure is fully automated and runs on every change: put it in the pipeline (30) or a deploy tool, and keep a runbook only for what happens when that fails. You need incident response at scale (paging, escalation, status pages): use an incident tool and link the runbooks from its alerts. A step is long or tricky: write it as a script in `ops/` with tests, and call it from the runbook.

Runbooks are Markdown files in `runbooks/` with four required sections (Preconditions, Steps, Verification, Rollback). `src/runner.ts` parses them and runs each step's fenced `sh` block, asks the operator for each `manual` block, stops at the first failure, prints the Rollback section and, with `--rollback auto`, runs it. Every run and step is stored in `ops.runs` and `ops.steps`. The release runbook migrates Postgres, restarts a member service (node:http) and smoke-tests it; release v3 ships a bug the smoke test catches, and the rollback runbook brings v2 back. `docs/adr/` holds three decision records, `docs/onboarding.md` a checklist, and `src/docs-lint.ts` checks all of them.

```sh
docker compose up -d --wait
npm i
npm run docs-lint                                     # runbooks, ADRs, onboarding checklist
npm run docs-lint -- fixtures/broken-docs             # what it rejects
npm run runbook -- runbooks/scheduled-release.md --set VERSION=v1 --set MIGRATION=1 --rollback auto
npm run runbook -- runbooks/scheduled-release.md --set VERSION=v2 --set MIGRATION=2 --rollback auto
npm run runbook -- runbooks/monthly-data-update.md --set FILE=data/contributions-2026-09.csv --set PERIOD=2026-09
npm run runbook -- runbooks/user-request.md --set MEMBER_ID=1 --set NEW_EMAIL=alice@new.example --set TICKET=SUP-1042   # asks at each manual step
npm run runbook -- runbooks/scheduled-release.md --set VERSION=v3 --set MIGRATION=3 --rollback auto                    # fails, rolls back
ops/service.sh stop
```

- `runbooks/scheduled-release.md`, `rollback.md`, `monthly-data-update.md`, `user-request.md` the procedures.
- `src/parse.ts` reads a runbook: title, `Owner:` and `Parameters:` lines, `##` sections, `###` steps, fenced blocks (a block before a section's first step is kept apart, for docs-lint to report).
- `src/runner.ts` runs it: parameters as environment variables (SQL blocks pass them on as `psql -v` variables in a quoted heredoc, never as SQL text), `bash -euo pipefail` per block, manual confirmation (terminal, or `--yes`), stop on failure, rollback printed or run, `ops.runs` and `ops.steps`.
- `src/docs-lint.ts` the documentation checks; `fixtures/broken-docs/` a runbook and an ADR it rejects.
- `data/contributions-2026-09.csv` the monthly file; `data/contributions-2026-09-corrected.csv` a corrected re-send for the same period, which the runbook refuses until the loaded batch is rolled back.
- `docs/adr/0001-0003` decision records in Nygard's format; `docs/onboarding.md` the checklist.
- `ops/migrate.ts` numbered up and down migrations from `migrations/`, recorded in `schema_migrations`.
- `ops/service.sh`, `ops/smoke.sh`, `ops/psql.sh` start and stop the service, the smoke test, psql inside the container.
- `src/app.ts` the member service; `APP_VERSION` picks v1, v2 or v3 (v3 reads a column that does not exist).
- `src/demo.ts` the six steps and their checks.

One-shot run with proof: `../run-31-runbook.sh` (log in `../logs/31-runbook.log`). Concepts explained in `../README.md`.
