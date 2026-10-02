# 29-kpis

**Pain: numbers that look good while members fail.** "712 logins this month" says nothing about the 58 eligible members who never came. A mean latency of about 50 ms hides the long-serving members who wait about 350 ms for their history. A health check answers 200 all through a four-hour outage in which change requests and contribution pages failed. Each team counts "active" or "resolved" its own way, nobody owns the number, and nobody knows what it should be.

**Reach for it when** a service needs to show whether it is used, whether members get their task done, and whether it is reliable enough: a product review, a service level agreed with partner organisations, a monthly report to whoever funds the team.

**Do not reach for it when** you need live alerting: page on burn rate from a metrics system (Prometheus, OpenTelemetry metrics), not from SQL run once a month. You have millions of events a day: send them to an analytics store (a warehouse, ClickHouse) rather than the transactional database. A product analytics tool already captures the funnel: keep the definitions file and point its SQL at the tool's export.

A member portal (`src/server.ts`, node:http, a separate process) that writes a usage event per member action into `events` and a row per HTTP request into `request_log`. A simulator drives 28 days of seeded traffic through it, including a four-hour database incident. Every KPI is defined once in `src/kpis.ts` (question, formula, unit, target, owner, SQL); the report runs those definitions and writes a static dashboard.

```sh
docker compose up -d --wait
npm i
npm run setup    # tables, 120 members across Acme, Globex, Initech
npm run server   # the portal on :53039 (FAULT_WINDOW=from/to to fail writes in a window)
npm run demo     # starts the server itself (stop the one above first), simulates, prints the KPIs, writes out/dashboard.html
npm run report   # recompute the KPI table and the dashboard from what is in the database
```

- `src/server.ts` the portal: routes, `track()` for usage events, `request_log` for every request with its route template, status and duration, and the fault window.
- `src/simulate.ts` 28 days of member visits (login, profile, contributions, change request with validation errors and abandonment), hourly health probes, and staff resolving requests, all on a simulated clock.
- `src/kpis.ts` the KPI definitions, the SLO and SLA constants, and `validate()`.
- `src/report.ts` runs the definitions, the funnel, failures per day and latency per route; prints the table.
- `src/dashboard.ts` renders `out/dashboard.html`: tiles, inline SVG bars, the definitions table. No script, no external library.
- `src/demo.ts` the eight steps and their checks.
- `out/dashboard.html` the dashboard from the last run.

One-shot run with proof: `../run-29-kpis.sh` (log in `../logs/29-kpis.log`). Concepts explained in `../README.md`.
