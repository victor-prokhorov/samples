# 29. Product and service KPIs

**Pain: numbers that look good while members fail.** "712 logins this month" says nothing about the 58 eligible members who never came. A mean latency of 51 ms hides the long-serving members who wait 356 ms for their contribution history. A health check answers 200 all through an outage that failed member requests for four hours. Each team counts "active" or "resolved" its own way, nobody owns the number, and nobody knows what it should be.

**Reach for it when** a service needs to show whether it is used, whether members get their task done, and whether it is reliable enough: a product review, a service level agreed with partner organisations, a monthly report to whoever funds the team.

**Do not reach for it when** you need live alerting: page on burn rate from a metrics system (Prometheus, OpenTelemetry metrics), not from SQL run once a month. You have millions of events a day: send them to an analytics store (a warehouse, ClickHouse) rather than the transactional database. A product analytics tool already captures the funnel: keep the definitions file and point its SQL at the tool's export.

A member portal (`src/server.ts`, node:http, a separate process) writes a usage event per member action into `events` and a row per HTTP request into `request_log`. A simulator drives 28 days of seeded traffic through it on a simulated clock: 120 members of Acme, Globex and Initech, hourly health probes, change requests with validation errors and abandonment, staff resolving the requests, and a four-hour database incident. Every KPI is defined once in `src/kpis.ts` (question, formula, unit, target, owner, SQL); the report runs those definitions, prints the table and writes a static HTML dashboard.

## Run

One shot with proof: `./run-29-kpis.sh` from the repo root (log in [`../logs/29-kpis.log`](../logs/29-kpis.log)).

By hand, from this folder (ports: Postgres 55459, HTTP 53039 portal):

```sh
docker compose up -d --wait
npm i
npm run setup    # tables, 120 members across Acme, Globex, Initech
npm run server   # the portal on :53039 (FAULT_WINDOW=from/to to fail writes in a window)
npm run demo     # starts the server itself (stop the one above first), simulates, prints the KPIs, writes out/dashboard.html
npm run report   # recompute the KPI table and the dashboard from what is in the database
```

## Files

- `src/server.ts` the portal: routes, `track()` for usage events, `request_log` for every request with its route template, status and duration, and the fault window.
- `src/simulate.ts` 28 days of member visits (login, profile, contributions, change request with validation errors and abandonment), hourly health probes, and staff resolving requests, all on a simulated clock.
- `src/kpis.ts` the KPI definitions, the SLO and SLA constants, and `validate()`.
- `src/report.ts` runs the definitions, the funnel, failures per day and latency per route; prints the table.
- `src/dashboard.ts` renders `out/dashboard.html`: tiles, inline SVG bars, the definitions table. No script, no external library.
- `src/demo.ts` the eight steps and their checks.
- `out/dashboard.html` the dashboard from the last run.

## Concepts

- **Two event streams**: usage events (`login`, `view_profile`, `change_started`, `change_submitted`, `change_rejected`) say what members did, in product terms; `request_log` (route template, status, duration) says what the service did. Product KPIs read the first, service KPIs the second. Both are written by the app itself, so a KPI is a query, not a spreadsheet someone fills in.
- **KPI definition**: each entry in `kpis.ts` has the question it answers, a formula in words, a unit, a target with a direction, an owner, and the SQL that computes it over a window (`$1` inclusive, `$2` exclusive). The report, the dashboard and the checks all read the same list, so "adoption" cannot mean two things. `validate()` rejects a definition with no question, owner or target before its number reaches a dashboard.
- **Vanity metric versus adoption**: a raw count (logins, page views) only grows with traffic and has no denominator. Adoption divides distinct eligible members who logged in by all eligible members; the base excludes members who left the scheme. Broken down by employer, it shows where to act (Initech at 22%).
- **Task success and completion time**: a task is a session that opened the change form; it succeeded if the same session submitted a valid request. Completion time is first submit minus first open, reported as a median with the p90 beside it, because times are skewed.
- **Funnel**: sessions reaching each step (login, profile, form opened, submitted). The drop between two steps locates the problem; the form error rate (422s over submissions) explains part of the last drop.
- **Percentiles, not means**: the mean blends many fast requests with a few slow ones. The p95 is what one request in twenty waits. Over all routes together the fast pages still drown the slow one, so the latency KPI takes the p95 of the slowest member route.
- **Availability, SLO and error budget**: availability is member requests answered without a 5xx over all member requests, measured where members are, not by a probe on `/health` that never touches the database. The SLO (99.5%) is the target; the error budget is what it allows, `(1 - SLO) x requests` failed requests (10.5 here). The burn rate is the error rate divided by the budget rate: 28x over the day of the incident (11 of 78 member requests failed) and about 85x during its four hours (11 of 26), which spent the month's budget in one morning. A spent budget is the agreed signal to put reliability work before features.
- **SLA**: an agreement with the partner organisations, here "change requests resolved within 3 days". It is measured on requests whose deadline fell in the window; a request still open past its deadline counts as missed.
- **Static dashboard**: one HTML file, no script and no external library, so it can be mailed, archived or attached to a report. Tiles show the value, the target, met or missed as text with an icon (not colour alone), the detail behind the ratio and the owner; inline SVG bars carry `<title>` tooltips; the definitions table sits under the charts.
- **Trade-offs**: KPIs computed from the transactional database compete with members' queries and only cover what the app emits; a missing event is a silent zero. Simulated time makes the run reproducible; in production `at` is `now()` and the window is a calendar month. A target is a negotiated number: set it from a baseline, revisit it, and never let a KPI become the goal itself (Goodhart's law).

## Proof (`logs/29-kpis.log`)

The app emitted 712 logins, but only 52 of 110 eligible members logged in at all:

```
   logins in the window: 712 (sounds like success)
   adoption: 47.3% (52 of 110 eligible members), target >= 60%
   Acme     25/55 eligible members active (45%)
   Globex   23/37 eligible members active (62%)
   Initech  4/18 eligible members active (22%)
```

The contributions page has a 51 ms mean and a 356 ms p95; all routes together have a p95 of 20 ms, which is why the KPI takes the slowest route:

```
   GET /contributions       397 requests  mean   51 ms  p95  356 ms
   GET /profile             639 requests  mean    6 ms  p95   17 ms
   POST /changes            179 requests  mean    7 ms  p95   16 ms
   all member routes together: mean 14 ms, p95 20 ms (the fast pages drown the slow one, so the KPI takes the slowest route)
```

The health probe saw no outage; member requests did, and the incident spent the whole error budget, burning it 28x faster than allowed over the day and about 85x during the four hours:

```
   health probes: 672, 100.0% answered 200
   availability:  99.48% (11 of 2102 requests failed), SLO 99.5%
   error budget:  11 failed of 10.5 allowed, remaining -5%
   09-17: 11 of 78 member requests failed (burn rate 28.2x the budget rate over the day)
     09:00: 0 of 2 failed (burn rate 0.0x)
     10:00: 3 of 8 failed (burn rate 75.0x)
     11:00: 5 of 11 failed (burn rate 90.9x)
     12:00: 3 of 5 failed (burn rate 120.0x)
   incident 09:00-13:00 (4 hours): 11 of 26 member requests failed (burn rate 84.6x the budget rate)

          hour          | probes | probes_ok | member_requests | failed
------------------------+--------+-----------+-----------------+--------
 2026-09-17 10:00:00+00 |      1 |         1 |               8 |      3
 2026-09-17 11:00:00+00 |      1 |         1 |              11 |      5
 2026-09-17 12:00:00+00 |      1 |         1 |               5 |      3
```

The funnel, and a draft KPI rejected because nobody owns it and it has no target:

```
   login                712
   view_profile         639 (-10% from login)
   change_started       175 (-73% from view_profile)
   change_submitted     149 (-15% from change_started)
   23 sessions hit a validation error at least once

   rejected: logins: no question
   rejected: logins: no owner
   rejected: logins: no target
```

The report, every row from a definition's SQL:

```
   KPI                                           value  target     status  owner          detail
   Adoption                                      47.3%  >= 60.0%   MISSED  product owner  52 of 110 eligible members
   Change request task success                   85.1%  >= 85.0%   met     product owner  149 of 175 tasks
   Change request completion time (median)       169 s  <= 240 s   met     UX lead        p90 398 s
   Form error rate                               13.4%  <= 10.0%   MISSED  UX lead        23 of 172 submissions
   Latency p95, slowest route                   356 ms  <= 300 ms  MISSED  tech lead      GET /contributions, all routes together 20 ms
   Availability                                 99.48%  >= 99.50%  MISSED  service owner  11 of 2102 requests failed
   Error budget remaining                        -4.7%  >= 0.0%    MISSED  service owner  11 failed of 10.5 allowed
   Requests resolved within 3 days               86.9%  >= 90.0%   MISSED  support lead   113 of 130 due
```

## Origins and further reading

- Book: *Site Reliability Engineering*, Beyer, Jones, Petoff, Murphy (eds.), 2016, chapter 4 "Service Level Objectives". https://sre.google/sre-book/service-level-objectives/
- Book: *The Site Reliability Workbook*, Beyer et al. (eds.), 2018, chapters "Implementing SLOs" and "Alerting on SLOs" (burn rate). https://sre.google/workbook/implementing-slos/
- Article: "Measuring the User Experience on a Large Scale: User-Centered Metrics for Web Applications" (the HEART framework), Rodden, Hutchinson, Fu, 2010. https://doi.org/10.1145/1753326.1753687
- Docs: "Measuring the success of your service", GOV.UK Service Manual (cost per transaction, user satisfaction, completion rate, digital take-up). https://www.gov.uk/service-manual/measuring-success
- Book: *Lean Analytics*, Alistair Croll and Benjamin Yoskovitz, 2013 (vanity metrics, one metric that matters).
- Article: "Improving ratings: audit in the British University system", Marilyn Strathern, 1997 (the general form of Goodhart's law: "when a measure becomes a target, it ceases to be a good measure").
