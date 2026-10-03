# 05. Strangler fig behind a proxy

**Pain: big-bang cutover.** Replacing a whole system in one switch is all-or-nothing: months without shipping, then one risky day with no easy way back.

**Reach for it when** replacing a large live system incrementally, when traffic can be routed by capability (URL, message type) and each piece can move on its own.

**Do not reach for it when** the system is small enough to replace in one release. The capability sits deep inside the monolith with no seam to route on: use branch by abstraction there. You would move the code but leave the shared database in place: plan the data move too (10, 11), or the coupling stays. There is no commitment to finish: a half-strangled system runs two stacks forever.

Replaces a monolith one capability at a time, behind a routing facade that clients never see change. Named by Martin Fowler (bliki "StranglerFigApplication", 2004). Three real HTTP servers (`src/servers.ts`): a legacy monolith on `:53001`, a new service on `:53002`, and a routing proxy on `:53000` that clients call. `PUT /_proxy/routes` changes routing at runtime; unmatched paths fall through to legacy. The demo moves `/orders`, rolls back, then moves everything, checking each response against legacy's recorded contract and counting legacy traffic. No infra.

## Run

One shot with proof: `./run-05-strangler-fig.sh` from the repo root (log in [`../logs/05-strangler-fig.log`](../logs/05-strangler-fig.log)).

By hand, from this folder (ports: HTTP 53000 proxy, 53001 legacy, 53002 new):

```sh
npm i
npm start
```

## Files

- `src/servers.ts` the legacy monolith, the new service (its own model, translated to the legacy shape at its edge) and the routing proxy with `PUT /_proxy/routes`.
- `src/index.ts` records legacy's responses as the contract baseline, moves routes, rolls back, and counts the requests legacy handled.

## Concepts

- **Facade (the proxy)**: clients switch once to a proxy in front of the legacy system. From then on, every migration step is a routing change inside the proxy, invisible to clients. In production this is an API gateway, a load balancer rule, nginx or Envoy, and a cutover usually shifts a percentage of traffic or a user cohort (canary) before moving 100%.
- **Strangling**: build one capability (`/orders`) in the new service, then route only that path to it. The new system grows around the old one until nothing is left, like the fig vine the pattern is named after.
- **Same contract**: the new service must answer exactly like legacy, or clients break. The new service has its own internal model (`totalCents`, `state: "PAID"`) and translates it to the legacy shape at its edge. The demo records legacy's responses (status and body) as a baseline and checks every proxied response against it, so a translation bug would show up as `false`. 04's parallel run is how you gain that confidence before flipping a route.
- **Instant rollback**: pointing a route back is one config call (`PUT /_proxy/routes`), no deploy and no client change. That is what makes each step low-risk.
- **Decommission signal**: once legacy receives zero traffic (and nothing bypasses the proxy: batch jobs, direct DB readers, internal callers), it can be switched off.
- **What the demo simplifies**: both services hold hard-coded copies of the same data. In a real migration, data ownership is the hard part. The new service needs the data legacy owns, usually via CDC (10) or events (09, 11) during the transition, and writes must have one owner per capability at any time.

## Proof (`logs/05-strangler-fig.log`)

Legacy traffic shrinks as routes move, with a rollback in the middle, and every response keeps legacy's contract (abridged):

```
## 1. Strangle the first capability
   routes: /orders -> new
   GET /users/1    -> legacy-monolith same contract as legacy: true
   GET /orders/1   -> new-service     same contract as legacy: true
   GET /invoices/1 -> legacy-monolith same contract as legacy: true
   legacy handled 2/3 client requests

## 2. Roll back in one call
   routes: (none, everything falls through to legacy)
   legacy handled 3/3 client requests

## 3. Move more capabilities
   routes: /orders -> new, /invoices -> new
   legacy handled 1/3 client requests

## 4. Last route moved, legacy receives nothing
   routes: /orders -> new, /invoices -> new, /users -> new
   GET /users/1    -> new-service     same contract as legacy: true
   GET /orders/1   -> new-service     same contract as legacy: true
   GET /invoices/1 -> new-service     same contract as legacy: true
   legacy handled 0/3 client requests
```

## Origins and further reading

- Article: "Strangler Fig Application", Martin Fowler, 2004, revised later. https://www.martinfowler.com/bliki/StranglerFigApplication.html
- Book: *Monolith to Microservices*, Sam Newman, 2019. https://samnewman.io/books/monolith-to-microservices/
- Talk: "Monolith Decomposition Patterns", Sam Newman, GOTO Berlin 2019. https://www.youtube.com/watch?v=9I9GdSQ1bbM
- Talk: "Dissecting our Legacy: The Strangler Fig Pattern with Apache Kafka, Debezium and MongoDB", Gunnar Morling and co-speaker, 2021. https://www.youtube.com/watch?v=R1kOuvLYcYo
