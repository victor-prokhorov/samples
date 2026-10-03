# 23. Executable specifications

**Pain: acceptance criteria that nobody runs.** The rules of a change ("above 1,000.00 a month it needs a second approval", "nobody approves their own request", "not in the past") live in a ticket. The code is written from a one-line summary, the tests check what the developer understood, and the gap is found in production or by an auditor. Nobody can say which requirement is tested by what, or whether it passes today.

**Reach for it when** business rules are agreed with people who do not read code (product owners, operations, auditors), the rules have boundaries and exceptions worth writing down as examples, and you must show which requirement is covered and passing.

**Do not reach for it when** nobody outside the team reads the feature files: the Given/When/Then layer then costs a pattern per step and buys nothing over plain tests named after the rule. The behaviour is layout or performance. The rules change daily and the examples would be rewritten more often than run.

`features/change-bank-details.feature` holds the acceptance criteria of "request a change of bank details" as five `Rule:` blocks tagged `@REQ-01` to `@REQ-05`, each with concrete scenarios. Cucumber runs them through the step definitions in `src/steps.ts` against an implementation chosen by `IMPL`: `naive` (written from the one-line ticket) or `domain` (written from the rules), both on Postgres. The traceability report is built from Cucumber's own message stream and stored in Postgres.

## Run

One shot with proof: `./run-23-specs.sh` from the repo root (log in [`../logs/23-specs.log`](../logs/23-specs.log)).

By hand, from this folder (ports: Postgres 55453):

```sh
docker compose up -d --wait
npm i
npm run setup                    # members, bank_accounts, change_requests, approvals, spec_results
IMPL=naive npm run specs         # 6 of 13 scenarios fail
IMPL=domain npm run specs        # 13 of 13 pass
npm run demo                     # both runs, then the traceability matrix for each
```

## Files

- `features/change-bank-details.feature` the acceptance criteria: one `Rule` per requirement, scenarios and scenario outlines with boundary examples (999.99, 1000.00, 1000.01; yesterday, today, tomorrow).
- `src/steps.ts` step definitions and the World: a fixed "today", a fresh database per scenario (`TRUNCATE` in `Before`), rule violations captured so a `Then` can assert on them.
- `src/service.ts` the interface both implementations share, and the threshold.
- `src/bank-details.ts` the domain implementation: self-approval check (neither whoever entered the request nor the member whose account it changes may approve it), one approval per staff member (primary key), two approvals above the threshold, date comparison on calendar days, an approved change becomes a new `bank_accounts` row from its effective date.
- `src/naive.ts` the implementation from the one-line ticket: one approval always applies the change, no self-approval check, and the effective date compared as a timestamp, so today counts as the past.
- `src/trace.ts` reads `--format message` output (ndjson): Rules and their `@REQ` tags, pickles, test cases, step results; rolls scenario results up to requirements.
- `src/demo.ts` runs Cucumber twice and prints and stores the traceability matrix.
- `cucumber.mjs` the Cucumber configuration (feature paths, step definitions, default formatter).
- `reports/naive.ndjson`, `reports/domain.ndjson` the Cucumber message streams of the last run, committed: the input of the traceability report.

## Concepts

- **Specification by example**: each rule is pinned by examples at its boundaries (999.99, 1000.00, 1000.01; yesterday, today, tomorrow). The examples are what the business agrees to and what the code is checked against; they replace "the threshold is 1,000" with what happens at 1,000.00 exactly.
- **Gherkin `Rule`**: Gherkin 6 added `Rule:` between `Feature` and `Scenario`, one per business rule. A tag on the rule (`@REQ-02`) is inherited by every scenario and every outline example under it, so a requirement id is written once.
- **Scenario outline**: one scenario, one row per example. Each row runs as its own test case (a pickle), so a failure names the row, here `[1000.01, awaiting second approval]`.
- **Step definitions**: Cucumber expressions (`{string}`, `{float}`, `{word}`) map each sentence to code that drives the domain. The World holds per-scenario state: a fixed "today" (the clock is a step, not `new Date()`), the last request, the last refusal. `Before` truncates the tables, so scenarios do not share data and can run in any order.
- **Same specs, two implementations**: the feature file does not change between the runs; only `IMPL` does. The naive code fails 6 of 13 scenarios for three reasons a reviewer could easily miss: one approval always applies the change, nothing stops self-approval (neither by whoever entered the request nor by the member whose account it changes, when staff entered it for them), and the effective date is compared as a timestamp (`new Date("2026-03-10") < now` at 09:30), so today counts as the past.
- **Traceability matrix**: `--format message` writes Cucumber messages (ndjson): the parsed feature, pickles with their tags and AST node ids, test cases, and every step result. `src/trace.ts` joins them into requirement, scenario, worst step status. A requirement is done when it has at least one scenario and all pass; one without scenarios shows as `NOT COVERED`. The results go to `spec_results` so the matrix is queryable.
- **Trade-offs**: every step is a regular-expression-like contract between prose and code, and a large suite turns into a maintenance job of its own (step reuse, ambiguous steps, slow end-to-end steps). Keep scenarios at the business-rule level against the domain, as here, and test the UI elsewhere (22). The value comes from the conversation that produces the examples (example mapping, three amigos); feature files written by developers alone are just verbose tests.

## Proof (`logs/23-specs.log`)

The naive implementation, written from the one-line ticket, fails the agreed examples. Cucumber names the scenario, the example row and the step (abridged):

```
6) Scenario: Yesterday is refused, today and later are accepted # features/change-bank-details.feature:77
   ✔ When "alice" requests to be paid into "FR7600000000000000033333333" from 2026-03-10 # src/steps.ts:52
   ✖ Then the request is "pending" # src/steps.ts:68
       Error: no request was recorded: refused with "effective date is in the past"

13 scenarios (6 failed, 7 passed)
   cucumber-js exit code (IMPL=naive): 1
```

The traceability report rolls those failures up to requirements (abridged):

```
   REQ-02 | Above 1,000.00 a month, a change needs approvals from two different staff members  => FAILING (2/5)
          | One approval is enough up to the threshold, not above it [1000.00, approved]                                  | passed
          | One approval is enough up to the threshold, not above it [1000.01, awaiting second approval]                  | failed
          | The same staff member cannot give both approvals                                                              | failed
   REQ-03 | Nobody can approve a request they made, or one that changes their own account  => FAILING (3/3)
          | A member cannot approve a request staff entered for them                                                      | failed
   REQ-04 | The effective date cannot be in the past  => FAILING (1/3)
          | Yesterday is refused, today and later are accepted [2026-03-10, "pending"]                                    | failed
   REQ-05 | Once approved, the new account is used from the effective date, and the old one before it  => passing (1)
```

The same feature file against the domain implementation passes, and every requirement is covered:

```
13 scenarios (13 passed)
84 steps (84 passed)
   cucumber-js exit code (IMPL=domain): 0
   5 requirements, 13 scenarios, all passing
```

The matrix in Postgres, both runs side by side:

```
 requirement | scenarios | naive_passed | domain_passed
-------------+-----------+--------------+---------------
 REQ-01      |         1 |            1 |             1
 REQ-02      |         5 |            3 |             5
 REQ-03      |         3 |            0 |             3
 REQ-04      |         3 |            2 |             3
 REQ-05      |         1 |            1 |             1
```

## Origins and further reading

- Article: "Introducing BDD", Dan North, 2006. https://dannorth.net/introducing-bdd/
- Book: *Specification by Example*, Gojko Adzic, 2011. https://gojko.net/books/specification-by-example/
- Book: *The Cucumber Book* (2nd edition), Matt Wynne, Aslak Hellesøy and Steve Tooke, 2017. https://pragprog.com/titles/hwcuc2/the-cucumber-book-second-edition/
- Article: "Introducing Example Mapping", Matt Wynne, 2015. https://cucumber.io/blog/bdd/example-mapping-introduction/
- Docs: Gherkin reference (`Rule`, `Scenario Outline`, tags). https://cucumber.io/docs/gherkin/reference/
- Docs: Cucumber messages, the protocol behind `--format message`. https://github.com/cucumber/messages
