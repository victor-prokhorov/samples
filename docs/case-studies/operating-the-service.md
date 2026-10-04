# Operating the service

## Problem

A small team runs the member portal for Acme, Globex and Initech: releases, monthly loads, a yearly statement campaign, and partner traffic on a shared backend. The samples' logs show how it goes when nothing is measured, gated or rehearsed:

- The health check answered 200 to all **672** probes while a four-hour incident failed **11 of 26** member requests. Over the month, availability is 99.48% against an SLO of 99.5%: 11 failed requests against 10.5 allowed ([29](../../29-kpis/)).
- Members say the Acme dashboard is slow; three processes each log "slow request" and nothing ties them together. One trace has **1502** database queries, 1500 of them the same one ([36](../../36-observability/)).
- A function with no test passes lint, types and all 8 tests, and line coverage drops to 70% ([30](../../30-pipeline/)).
- A naive container cutover fails **268 of 374** requests ([38](../../38-containers/)).
- Next to Acme's batch export, the quiet tenants' p95 goes from **27 ms to 250 ms** ([45](../../45-rate-limiting/)).
- A search by email has a p95 of **3,135 ms** at 60 searches a second offered, and nobody knew where the API saturates ([46](../../46-load-test/)).
- A statement mail-out loop crashes and is run again: four members get two statements, three get none, and nothing records why ([28](../../28-campaign/)).
- Restoring the last base backup after a bad `DELETE` would give back 3 of 6 contributions ([31](../../31-runbook/)).

## Constraints

- Targets agreed with the partner organisations: 99.5% of member requests answered, a 300 ms latency objective, change requests resolved within 3 days.
- A few people, so procedures are run by whoever is on call, not by the one person who knows them.
- One database pool shared by every tenant; the campaign and month end are known peaks.
- Releases on a schedule or a release tag, never from a laptop.

## Decisions

| Decision | Trade-off |
| --- | --- |
| **Define each KPI once, measured where members are.** Question, formula, target, owner and SQL in one file; availability from member requests, not from a probe ([29](../../29-kpis/)). | Computed from the transactional database; a missing event is a silent zero. |
| **One trace id across logs, traces and metrics.** OpenTelemetry carries `traceparent` from web to API to SQL comments; RED per route with a histogram edge at 300 ms ([36](../../36-observability/)). | Every span costs a little; production needs sampling. |
| **Gate every change; deploy only on a schedule or a tag.** Lint, types, a coverage gate, axe, audit, build; a drift check across three CI platforms ([30](../../30-pipeline/)). | A fix waits for the schedule unless someone tags a release. |
| **One image; switch on readiness, drain on SIGTERM.** Multi-stage build, non-root, secrets as build mounts; `/readyz` separate from `/healthz` ([38](../../38-containers/)). | The proxy is hand-rolled; an orchestrator gives the same with probes and `preStop`. |
| **Runbooks the runner executes, and a restore drill.** Preconditions, steps, verification and rollback in Markdown; every run recorded; point-in-time recovery measured ([31](../../31-runbook/)). | Shell in Markdown is harder to test than a script, so long logic goes in `ops/`. |
| **A token bucket per tenant and per key, in Postgres.** 429 with `Retry-After` and the `RateLimit` headers ([45](../../45-rate-limiting/)). | A round trip per request; limits share capacity, they do not add any. |
| **Load test with an open model and SLO thresholds.** Smoke, gate, ramp and soak with k6; the gate exits 99 when the SLO is crossed ([46](../../46-load-test/)). | The absolute numbers hold only for the machine that produced them. |
| **The campaign as a job table.** One row per member and year, `FOR UPDATE SKIP LOCKED` with a lease, retries with backoff, dead letters, a stable Message-ID ([28](../../28-campaign/)). | A send whose outcome was lost is resent, so the receiver may get it twice, with the same Message-ID. |

## What could go wrong, and how it was guarded

| Risk | Guard, as the logs show it |
| --- | --- |
| An outage the probe does not see | Availability counts member requests; the incident burned the budget 84.6x faster than allowed over its four hours. |
| A slow route with no explanation | The slowest log line leads to its trace: 1505 spans, an N+1. One join: the Acme dashboard median goes from 1379 ms to 35 ms, and 30 of 30 requests are within 300 ms (19 of 30 before). |
| Untested or drifting changes reach production | The unit job fails on coverage; a drifted Azure copy that would deploy `v1.4.0-rc1` is caught. |
| Requests dropped during a deploy | Green takes traffic only when `/readyz` answers 200; blue drains its 9 requests in flight. 354 requests, 0 failed. |
| A release breaks the member page | The v3 smoke test gets a 500; the rollback runbook brings back v2 and schema 2 as a recorded child run. |
| Data deleted by mistake | Restored to 0.7 s before the `DELETE` (target 60 s), rows back in 6.2 s (target 300 s), checksums equal table by table. |
| One tenant starves the others | With limits, the quiet tenants' p95 is 41 ms and they see no 429; 2117 refusals never reach Postgres. |
| A peak above capacity | The ramp shows the API serves at most 95/s (Little's law says 100/s) and the p95 crosses 300 ms at 125/s offered; the soak holds 4 connections and flat memory. |
| The campaign crashes half-way | Resumed by two workers: nothing already sent is sent again, bob gets his after two 451s, and the report shows 15 sent and 1 dead letter with its reason. |

## Proof

![The N+1 trace: one web request, one API call and a comb of 1500 identical queries](../../36-observability/screenshots/waterfall-before.png)

![Blue-green cutover request by request: the naive switch fails 268 requests, the safe one none](../../38-containers/screenshots/switch-timeline.png)

- [29 KPIs and SLO](../../29-kpis/), log [`29-kpis.log`](../../logs/29-kpis.log), dashboard [`dashboard.html`](../../29-kpis/out/dashboard.html)
- [36 observability](../../36-observability/), log [`36-observability.log`](../../logs/36-observability.log), [after the fix](../../36-observability/screenshots/waterfall-after.png), [an error trace](../../36-observability/screenshots/trace-error.png)
- [31 runbooks and restore drill](../../31-runbook/), log [`31-runbook.log`](../../logs/31-runbook.log), overview [`overview.svg`](../../31-runbook/diagrams/overview.svg)
- [30 pipeline](../../30-pipeline/), log [`30-pipeline.log`](../../logs/30-pipeline.log), [coverage gate failed](../../30-pipeline/screenshots/coverage-gate-failed.png)
- [38 containers](../../38-containers/), log [`38-containers.log`](../../logs/38-containers.log)
- [45 rate limiting](../../45-rate-limiting/), log [`45-rate-limiting.log`](../../logs/45-rate-limiting.log), [requests per tenant](../../45-rate-limiting/screenshots/requests.png)
- [46 load test](../../46-load-test/), log [`46-load-test.log`](../../logs/46-load-test.log), [throughput and latency](../../46-load-test/screenshots/throughput-latency.png)
- [28 campaign batch](../../28-campaign/), log [`28-campaign.log`](../../logs/28-campaign.log), a rendered statement [`statement-2025-M0011.pdf`](../../28-campaign/out/statement-2025-M0011.pdf)
