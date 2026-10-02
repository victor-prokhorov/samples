# 23-specs

**Pain: acceptance criteria that nobody runs.** The rules of a change ("above 1,000.00 a month it needs a second approval", "nobody approves their own request", "not in the past") live in a ticket or a spec document. The code is written from a one-line summary, the tests check what the developer understood, and the gap shows up in production, often as a fraud or an audit finding. Nobody can say which requirement is tested by what, or whether it passes today.

**Reach for it when** business rules are agreed with people who do not read code (product owners, operations, auditors), the rules have boundaries and exceptions worth writing down as examples, and you need to show which requirement is covered and passing.

**Do not reach for it when** nobody outside the team reads the feature files: the Given/When/Then layer then costs a regex per step and buys nothing over plain tests named after the rule. The behaviour is UI layout or performance. The rules change daily and the examples would be rewritten more often than run.

`features/change-bank-details.feature` holds the acceptance criteria of "request a change of bank details" as five `Rule:` blocks tagged `@REQ-01` to `@REQ-05`, each with concrete scenarios. Cucumber runs them through the step definitions in `src/steps.ts` against an implementation chosen by `IMPL`: `naive` (written from the one-line ticket) or `domain` (written from the rules). Both use Postgres. The traceability report reads Cucumber's own message stream.

```sh
docker compose up -d --wait
npm i
npm run setup                    # members, bank_accounts, change_requests, approvals, spec_results
IMPL=naive npm run specs         # 6 of 13 scenarios fail
IMPL=domain npm run specs        # 13 of 13 pass
npm run demo                     # both runs, then the traceability matrix for each
```

- `features/change-bank-details.feature` the acceptance criteria: one `Rule` per requirement, scenarios and scenario outlines with boundary examples (999.99, 1000.00, 1000.01; yesterday, today, tomorrow).
- `src/steps.ts` step definitions and the World: a fixed "today", a fresh database per scenario (`TRUNCATE` in `Before`), rule violations captured so a `Then` can assert on them.
- `src/service.ts` the interface both implementations share, and the threshold.
- `src/bank-details.ts` the domain implementation: self-approval check (neither whoever entered the request nor the member whose account it changes may approve it), one approval per staff member (primary key), two approvals above the threshold, date comparison on calendar days, an approved change becomes a new `bank_accounts` row from its effective date.
- `src/naive.ts` the implementation from the one-line ticket: one approval always applies the change, no self-approval check, and the effective date compared as a timestamp, so today counts as the past.
- `src/trace.ts` reads `--format message` output (ndjson): Rules and their `@REQ` tags, pickles, test cases, step results; rolls scenario results up to requirements.
- `src/demo.ts` runs Cucumber twice and prints and stores the traceability matrix.
- `cucumber.mjs` the Cucumber configuration (feature paths, step definitions, default formatter).

One-shot run with proof: `../run-23-specs.sh` (log in `../logs/23-specs.log`). Concepts explained in `../README.md`.
