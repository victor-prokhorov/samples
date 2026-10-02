# 22-playwright

**Pain: end-to-end tests nobody trusts.** They pass on a laptop and fail on CI because of a fixed `sleep`. They break when a designer renames a CSS class. They pass alone and fail together because one test leaves rows that the next one counts. Every test signs in through the login page, so the suite is slow, and when one fails there is nothing to look at but a stack trace.

**Reach for it when** a few user journeys must keep working release after release (sign in, see my contributions, request a change and see it pending) and you want them checked in a real browser, in parallel, on every change.

**Do not reach for it when** the behaviour is a rule you can call directly: test it with a unit test (here, Vitest), which is a thousand times faster and covers every edge case. Keep browser tests to one journey per outcome.

A small member portal (`node:http`, server-rendered HTML, Postgres) and two test suites: Vitest for the rule that accepts or refuses a change request, and `@playwright/test` for the journeys. Each Playwright worker clones its own database from a template and starts its own app server; a setup project signs in once and saves the session.

```sh
docker compose up -d --wait
npm i
npm run setup      # template database portal_template, and portal for the hand-run server
npm run server     # http://localhost:53032 (alice / alice-password)
npm run test:unit  # vitest
npm run test:e2e   # playwright, every spec
npm run demo       # the runs the log shows: green, leaking, flaky, brittle
```

- `src/app.ts` the portal: sign-in, contributions (the total arrives through a delayed `fetch`), request a change, list requests. `MARKUP=v2` serves a refactored sign-in form; `API_DELAY_MS` delays the total.
- `src/rules.ts` and `src/rules.test.ts` the change-request rule and its unit tests.
- `src/session.ts` a signed session cookie, valid on every worker's server; `src/db.ts` template cloning; `src/setup.ts` the template; `src/server.ts` the hand-run server.
- `playwright.config.ts` workers, `trace: "retain-on-failure"`, the `setup` project and `storageState`.
- `e2e/fixtures.ts` the worker-scoped database and server, and the per-test reset.
- `e2e/auth.setup.ts` signs in once and saves `.auth/alice.json`.
- `e2e/journeys.spec.ts` the journeys, with role and label locators.
- `e2e/waiting.spec.ts` a fixed sleep next to a web-first assertion; `e2e/locators.spec.ts` CSS selectors next to role and label locators.
- `src/demo.ts` runs the suites in the configurations the log shows and checks each outcome.

One-shot run with proof: `../run-22-playwright.sh` (log in `../logs/22-playwright.log`). Concepts explained in `../README.md`.
