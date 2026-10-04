# 2. No framework in samples 01 to 19

Date: 2026-10-03

## Status

Accepted

## Context

Samples 01 to 19 each prove one mechanism for changing or running a live system: a transaction that writes an audit row, a retry policy, an idempotency key, a saga log, a fencing token. Frameworks and libraries implement most of these (ORMs, resilience libraries, saga engines, outbox modules). With one in place, the sample would show how to configure that library, and the reader could not see where the guarantee comes from or what it costs.

## Decision

Samples 01 to 19 use TypeScript run by `tsx`, the `pg` driver, `node:http` and Node's standard library, and write each mechanism by hand in a file the README names (for example `src/resilience.ts` in 06). The only third-party runtime dependencies are clients for the infrastructure under study (`kafkajs` in 09 to 12) and, in 07, Express 5 as a thin router: every header that sample is about (`If-Match`, `ETag`, `Range`, `Idempotency-Key`) is still handled in its own code. Samples 20 to 32 build a product and use the libraries a team would use there (Next.js, Playwright, Cucumber, oidc-provider and openid-client), because how to use them well is their subject.

## Consequences

Each mechanism fits in a few hundred lines a reader can follow from the log to the code. The hand-written versions are not production libraries: they skip options, metrics and edge cases a maintained library covers, and the READMEs say so and name the library to reach for. Upgrades in 01 to 19 touch only `pg`, `kafkajs`, Express and the TypeScript toolchain.
