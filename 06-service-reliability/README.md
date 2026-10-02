# 06-service-reliability

**Pain: one flaky dependency takes the caller down.** A call with no deadline waits as long as a hung dependency does, and every waiting call holds a socket the healthy dependencies need. Naive retries turn a blip into an outage, and retrying a POST that timed out after the server committed charges the customer twice.

**Reach for it when** a service calls another over the network on a request path: every such call needs a timeout, a retry policy that knows which failures are transient, and, for writes, an idempotency key. Add a breaker and a bulkhead when one dependency's outage must not slow down or starve everything else.

**Do not reach for it when** the work does not need an answer now: put it on a queue or an outbox (09) and let a consumer retry at its own pace. The operation spans services that each commit their own data: retries make each step safe, a saga (08) handles the whole. A service mesh or client library already gives you timeouts, retries and breakers: configure it rather than hand-rolling a second layer, and make sure only one layer retries.

A caller process against `payments`, a separate HTTP process with its own Postgres database that the demo degrades, overloads, kills and restarts. The retry, backoff, retry budget, breaker and bulkhead are written by hand in `src/resilience.ts`, with no resilience library. Idempotency keys live in a Postgres table whose primary key is the key, with the stored response written in the same transaction as the charge.

```sh
docker compose up -d --wait
npm i
npm run setup    # database payments: charges, idempotency_keys
npm run demo     # starts payments (npm run payments) as a child process, runs the 6 scenarios, stops it
```

- `src/resilience.ts` `call()` with a timeout and the `x-deadline-ms` header, `isRetryable`, `withRetries` (full jitter, max attempts, overall deadline, `Retry-After`, `RetryBudget`), `CircuitBreaker`, `Bulkhead`.
- `src/payments.ts` the dependency: `/quote`, `POST /charges` with idempotency keys, a fault switch (`PUT /_faults`) and counters (`GET /_stats`) the demo reads.
- `src/demo.ts` the caller: each scenario with and without the protection, and the numbers the dependency saw.

One-shot run with proof: `../run-06-service-reliability.sh` (log in `../logs/06-service-reliability.log`). Concepts explained in `../README.md`.
