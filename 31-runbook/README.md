# 31. Executable runbooks, ADRs and docs-lint

**Pain: operations that live in one person's head.** The release goes fine when the person who always does it is in; when they are away, the backup is skipped, the migration runs after the restart, and nobody knows how to go back. The wiki page for the monthly data load drifted from what people actually type. A new team member cannot tell a deliberate decision from an accident, so they undo it or are afraid to touch it.

**Reach for it when** a small team runs a service: releases, data loads, member requests and rollbacks are repeated by different people, some steps need a human, and every run should leave a record.

**Do not reach for it when** the procedure is fully automated and runs on every change: put it in the pipeline (30) or a deploy tool, and keep a runbook only for what happens when that fails. You need incident response at scale (paging, escalation, status pages): use an incident tool and link the runbooks from its alerts. A step is long or tricky: write it as a tested script in `ops/` and call it from the runbook.

Four runbooks in Markdown in `runbooks/` (scheduled release, rollback, monthly data update, a member's change request), each with four required sections: Preconditions, Steps, Verification and Rollback. `src/runner.ts` parses them, runs each step's fenced `sh` block, asks the operator at each `manual` block, stops at the first failure, prints the Rollback section and, with `--rollback auto`, runs it. Every run and step is recorded in Postgres (`ops.runs`, `ops.steps`). The release runbook migrates the schema, restarts a member service (node:http) and smoke-tests it; release v3 ships a bug the smoke test catches, and the rollback runbook brings v2 back. `docs/adr/` holds three decision records, `docs/onboarding.md` a checklist, and `src/docs-lint.ts` checks all of them.

## Run

One shot with proof: `./run-31-runbook.sh` from the repo root (log in [`../logs/31-runbook.log`](../logs/31-runbook.log)).

By hand, from this folder (ports: Postgres 55461, HTTP 53041 member service):

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

## Files

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

## Concepts

- **Runbook**: a written procedure for a recurring operational task, with an owner and parameters. The four sections answer the operator's questions in order: may I start (Preconditions), what do I do (Steps), did it work (Verification), how do I undo it (Rollback).
- **Executable documentation**: steps are fenced `sh` blocks in the Markdown, so the document a person reads and the commands the runner executes are the same text and cannot drift apart. Parameters (`--set VERSION=v3`) become environment variables; each block runs under `bash -euo pipefail`, so any failing command fails the step.
- **Manual steps and do-nothing scripting**: a `manual` block is a step only a person can do (call the member back to verify their identity). The runner shows it and waits for a confirmation, from a terminal or `--yes`; with no operator it stops there and nothing after it runs. Manual steps stay visible in the same flow and are automated one at a time, which is how a procedure moves from a document to a script without a big rewrite.
- **Preconditions guard, rollback undoes**: a failed precondition means nothing changed (exit 2, no rollback needed): the second load of the same file stops at "not loaded before" because its sha256 is already in `import_batches`, and a corrected file for a period already loaded stops at "no batch for this period yet": replacing a verified load is a deliberate rollback of that batch first, never a side effect. A failed step or verification stops the runbook, prints its Rollback section, and with `--rollback auto` runs it. Verification and rollback are scoped to the batch (found by the file's sha256), so a rollback never deletes rows another load put there.
- **One rollback procedure**: the release's Rollback section calls `runbooks/rollback.md` through the runner, so the automatic rollback and the one an engineer runs by hand the next morning are the same tested procedure, recorded as a child run (`parent` in `ops.runs`).
- **Release steps in a safe order**: record the running release (so rollback knows where to return), back up, migrate (additive, expand/contract as in 02, so the old version keeps working on the new schema), restart, smoke-test the few requests that prove members are served, and only then record the new release. Each migration has a `.down.sql` that removes exactly what its `.up.sql` added.
- **Run log**: `ops.runs` and `ops.steps` keep who ran what, with which parameters, how each step ended and the tail of its output: an audit trail of operations, and the place to look first after an incident.
- **ADR (Architecture Decision Record)**: a short numbered file per decision that is expensive to reverse, in Michael Nygard's format: title, date, status, context, decision, consequences. Records are not edited once accepted; a new one supersedes the old, whose status links to it.
- **Onboarding checklist**: what a new team member reads and does in the first two weeks, linked to the ADRs and runbooks, ending with running each runbook under supervision and improving one.
- **docs-lint**: documentation is checked like code. Every runbook needs an owner, a parameters line, the four sections in order, and steps that each hold an `sh` or `manual` block, with no block between a section heading and its first step (the runner would never run it); every ADR needs a number matching its file name, a date, a status from a fixed list (a "Superseded by" must link to an existing record) and the three other sections; relative links must resolve. Run it in the pipeline (30).
- **Trade-offs**: shell in Markdown is harder to test than a script, so long logic belongs in `ops/`. Parameters never become SQL text: each SQL block is a quoted heredoc (`<<'SQL'`, so bash expands nothing in it) and gets its values as `psql -v` variables, read as `:'email'` (quoted by psql) or `:'id'::int` (anything but a number fails), so `bob.o'brien@example.org` is stored as typed. `psql -c` does not expand variables, which is why those statements go through stdin. Down migrations drop columns, so data written to them since the release is lost on rollback; past that point, restore the backup instead (the rollback runbook says so). The run log lives in the database it operates on; in production keep it elsewhere, or a failed restore also loses its record.

## Proof (`logs/31-runbook.log`)

docs-lint rejects a runbook with missing sections and a block outside any step, and an ADR without a status, and passes the real documents:

```
   fixtures/broken-docs/runbooks/restore-backup.md: no 'Parameters:' line (write 'Parameters: none')
   fixtures/broken-docs/runbooks/restore-backup.md: no '## Preconditions' section
   fixtures/broken-docs/runbooks/restore-backup.md: '## Verification' has no '### step'
   fixtures/broken-docs/runbooks/restore-backup.md: '## Verification' has a sh block outside any '### step' (it never runs)
   fixtures/broken-docs/runbooks/restore-backup.md: no '## Rollback' section
   fixtures/broken-docs/docs/adr/0004-use-a-message-queue.md: no '# N. Title' heading
   fixtures/broken-docs/docs/adr/0004-use-a-message-queue.md: no 'Date: YYYY-MM-DD' line
   fixtures/broken-docs/docs/adr/0004-use-a-message-queue.md: no '## Status' section
   fixtures/broken-docs/docs/adr/0004-use-a-message-queue.md: no '## Consequences' section
   fixtures/broken-docs/docs/onboarding.md: missing: every team needs an onboarding checklist
```

Release v3 migrates and restarts, the smoke test gets a 500, and the rollback runbook brings back v2 and schema 2 (abridged):

```
    3. Migrate the schema
      | migrate up 003_statement_preference
      | schema version 3
      [ok] 1.1s
    4. Restart the service on the new version
      | stopped pid 6495
      | started v3 (pid 10592)
      [ok] 1.9s
    5. Smoke test
      | GET /health -> {"status":"ok","version":"v3"}
      | GET /members/1 -> {"error":"column \"statement_pref\" does not exist"} 500
      | member page is broken
      [FAILED (exit 1)] 0.1s
  stopped at "5. Smoke test". Rollback (runbooks/scheduled-release.md):
    1. Roll back to the recorded release
      $ npx tsx src/runner.ts runbooks/rollback.md --operator "$RUNBOOK_OPERATOR" --parent "$RUNBOOK_RUN_ID"
  rollback
    1. Roll back to the recorded release
      | runbook #10: Roll back a release (runbooks/rollback.md), operator alice
      |     2. Migrate the schema down to the previous release
      |       | migrate down 003_statement_preference
      |       | schema version 2
      |       | GET /health -> {"status":"ok","version":"v2"}
      |       | GET /members/1 -> {"id":1,"name":"alice","email":"alice@new.example","preferred_name":null} 200
      | runbook #10: succeeded
      [ok] 4.6s
runbook #9: failed, rolled back
```

The same file a second time, then a corrected file for the same period: a precondition stops each run before anything changes, and the verified load stays as it was (abridged):

```
    1. The file is there and has not been loaded before
      | sha256 92e7a1ad1c61, batches already loaded from this file: 1
      [FAILED (exit 1)] 0.3s
runbook #4: precondition failed: nothing was changed
runbook #5: Monthly data update (runbooks/monthly-data-update.md) FILE=data/contributions-2026-09-corrected.csv PERIOD=2026-09, operator alice
    3. No batch is loaded for this period yet
      | already loaded for 2026-09: batch 1 from data/contributions-2026-09.csv
      [FAILED (exit 1)] 0.3s
runbook #5: precondition failed: nothing was changed
   => exit 2
   contributions: 3 rows, total 1102.75, 1 batch
```

Without an operator, the member request stops at its first manual step and prints its rollback; nothing ran after it:

```
    1. Verify the member's identity
      | MANUAL: Call the member back on the phone number their employer holds (not the one in the email) and confirm the request.
      [not confirmed] 0.0s
  stopped at "1. Verify the member's identity". Rollback (runbooks/user-request.md):
runbook #6: failed, rollback printed for the operator
```

Parameters reach SQL as psql variables, so a quote in an address is data: the verification reads it back and the audit row has it as typed:

```
      | stored bob.o'brien@example.org, changes on SUP-1043: 1
   member 2: {"email":"bob.o'brien@example.org","old_value":"bob@example.org","new_value":"bob.o'brien@example.org"}
```

Every run is recorded; the second load of the same file and the corrected file were stopped by a precondition, and run 10 is the rollback run 9 started:

```
 id |             runbook             |                                      params                                      | operator | parent |                  outcome                  | seconds
----+---------------------------------+----------------------------------------------------------------------------------+----------+--------+-------------------------------------------+---------
  1 | runbooks/scheduled-release.md   | {"VERSION": "v1", "MIGRATION": "1"}                                              | alice    |        | succeeded                                 |     2.6
  2 | runbooks/scheduled-release.md   | {"VERSION": "v2", "MIGRATION": "2"}                                              | alice    |        | succeeded                                 |     5.4
  3 | runbooks/monthly-data-update.md | {"FILE": "data/contributions-2026-09.csv", "PERIOD": "2026-09"}                  | alice    |        | succeeded                                 |     2.2
  4 | runbooks/monthly-data-update.md | {"FILE": "data/contributions-2026-09.csv", "PERIOD": "2026-09"}                  | alice    |        | precondition failed: nothing was changed  |     0.3
  5 | runbooks/monthly-data-update.md | {"FILE": "data/contributions-2026-09-corrected.csv", "PERIOD": "2026-09"}        | alice    |        | precondition failed: nothing was changed  |     1.1
  6 | runbooks/user-request.md        | {"TICKET": "SUP-1042", "MEMBER_ID": "1", "NEW_EMAIL": "alice@new.example"}       | alice    |        | failed, rollback printed for the operator |     0.3
  7 | runbooks/user-request.md        | {"TICKET": "SUP-1042", "MEMBER_ID": "1", "NEW_EMAIL": "alice@new.example"}       | alice    |        | succeeded                                 |     1.1
  8 | runbooks/user-request.md        | {"TICKET": "SUP-1043", "MEMBER_ID": "2", "NEW_EMAIL": "bob.o'brien@example.org"} | alice    |        | succeeded                                 |     1.1
  9 | runbooks/scheduled-release.md   | {"VERSION": "v3", "MIGRATION": "3"}                                              | alice    |        | failed, rolled back                       |     8.4
 10 | runbooks/rollback.md            | {}                                                                               | alice    |      9 | succeeded                                 |     3.6
```

## Origins and further reading

- Article: "Documenting Architecture Decisions", Michael Nygard, 2011. https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- Docs: ADR templates and tooling (adr-tools, MADR), the adr.github.io community. https://adr.github.io/
- Article: "Do-nothing scripting: the key to gradual automation", Dan Slimmon, 2019. https://blog.danslimmon.com/2019/07/15/do-nothing-scripting-the-key-to-gradual-automation/
- Book: *Site Reliability Engineering*, Beyer, Jones, Petoff, Murphy (eds.), 2016, chapters 7 "The Evolution of Automation at Google" and 8 "Release Engineering". https://sre.google/sre-book/release-engineering/
- Book: *The Checklist Manifesto*, Atul Gawande, 2009 (read-do and do-confirm checklists).
- Book: *Docs for Developers*, Bhatti, Corleissen, Lambourne, Nunez, Waterhouse, 2021 (documentation as code, linting docs).
