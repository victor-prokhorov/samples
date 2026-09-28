# 15-choreographed-saga

**Pain: a coordinator every flow must go through.** 06's orchestrator knows every step of every service; each new flow or step is a change to that one component, and the team that owns it becomes the queue. Removing it naively (services calling each other, or publishing to Kafka straight from code) brings back partial failure and dual writes.

**Reach for it when** a few services, owned by different teams, react to each other's business events in a short, stable flow (three or four steps, one or two failure paths), and the events are useful beyond this one flow.

**Do not reach for it when** the flow has many steps, branches, timers or human steps, or changes often: every change touches several services, and no one place shows the flow; use 06 or a workflow engine. You need to answer "where is order X right now?" in one query, or to reason about the failure paths in one file: choreography spreads both across services. The services form cycles (here three pairs listen to each other): an orchestrator removes them.

06's order flow (reserve stock, charge, ship; release and refund on failure) with no orchestrator. Four services (`orders`, `inventory`, `payments`, `shipping`), each with its own Postgres database, react to events and publish their own. Each handler inserts the incoming `event_id` into `processed_messages`, applies its effect and writes its outgoing event into its own `outbox`, in one local transaction; a relay per service (07's) sends the outbox to that service's Kafka topic, keyed by order id. The four services run in one process for the toy.

```sh
docker compose up -d --wait
npm i
npm run setup      # 4 databases, 4 topics with 3 partitions each, stock = 10
npm run demo       # wiring, happy path, payment failure, shipping failure, then inventory crashes before its offset commit (exit 1)
npm run resume     # new process: Kafka redelivers, processed_messages makes it a no-op; then one topic lags (out-of-order events)
npm run timeline -- order-C order-D order-E   # rebuild each saga from the four outboxes
```

- `src/services.ts` the four services: which events each reacts to, its effect, what it publishes, and the order state machine.
- `src/bus.ts` idempotent consumer (effect + processed event + outgoing event in one transaction), outbox relay, settle.
- `src/timeline.ts` rebuilds one order's saga by correlation id (order id) and causation id.

One-shot run with proof: `../run-15-choreographed-saga.sh` (log in `../logs/15-choreographed-saga.log`). Concepts explained in `../README.md`.
