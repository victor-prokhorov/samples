# 09. Transactional outbox, polling relay

**Pain: dual write.** The app must update its database and tell Kafka, two systems with no shared transaction. A crash between the two writes loses the event or publishes one for a change that never committed.

**Reach for it when** a service changes its own database and must reliably tell others what happened in business terms (`OrderPlaced`), and consumers can handle a duplicate: delivery is at least once. Start here; a polling relay covers most volumes.

**Do not reach for it when** consumers want every row change from any writer, not business events (10). Losing a notification is acceptable: publish best effort. The caller needs the other side's answer before it can reply: that is a synchronous call, not an event. Poll latency, query load or table cleanup already hurt (11).

The simplest reliable way to publish events: a transactional outbox with a polling relay. No Debezium, just a table and a loop. The app writes the business row and an `outbox` row in one transaction. `src/relay.ts` claims unpublished rows with `FOR UPDATE SKIP LOCKED`, sends them to Kafka, then sets `published_at`. Postgres + Kafka only.

## Run

One shot with proof: `./run-09-outbox-polling.sh` from the repo root (log in [`../logs/09-outbox-polling.log`](../logs/09-outbox-polling.log)).

By hand, from this folder (ports: Postgres 55437, Kafka 59094):

```sh
docker compose up -d --wait
npm i
npm run setup     # orders + outbox tables, Kafka topic
npm run consume   # terminal 1: idempotent consumer, dedupes by event_id header
npm run app       # terminal 2: writes orders + outbox rows
npm run relay     # drain the outbox to Kafka (add -- --crash-after-send to simulate a crash)
```

## Files

- Send first, mark published second: a crash in between means duplicates, never loss (at-least-once).
- `SKIP LOCKED` lets several relays run at once without double-claiming rows, at the cost of per-aggregate ordering.

## Concepts

- **The dual-write problem**: a service must update its database *and* tell other services (publish to Kafka). These are two systems with no shared transaction. Commit then publish: a crash in between loses the event. Publish then commit: a failed commit leaves an event for something that never happened. Retries do not fix this, because the process that would retry is the one that crashed.
- **Outbox table**: instead of publishing, the service inserts the event as a row in `outbox` *in the same transaction* as the business change (`emit()` in `src/app.ts`). One atomic write: both happen or neither does. The app never talks to Kafka.
- **Outbox row shape**: `id` (BIGSERIAL; the relay publishes in id order, and ids follow insert order, not commit order), `event_id` (uuid, the identity consumers dedupe on), `aggregate_id` (becomes the Kafka key, so one order's events stay ordered on one partition), `type`, `payload` (JSONB), `created_at`, `published_at` (null = not yet sent). A partial index on `published_at IS NULL` keeps the poll query cheap as the table grows.
- **Polling publisher (the relay)**: a separate process (`src/relay.ts`) loops: open a transaction, claim up to 10 unpublished rows, send them to Kafka, set `published_at`, commit. It stops when nothing is left (a real relay sleeps and polls again). Holding the transaction open during the send is the simplest correct form; production relays keep batches small or claim rows with a lease column instead.
- **`FOR UPDATE SKIP LOCKED`**: claiming rows locks them, and other relay instances skip locked rows instead of waiting. You can run several relays for throughput or availability without sending the same row twice concurrently. The price: ordering. Two relays can claim one order's events in different batches and send them in either order, so keep a single active relay (others on standby, elected as in 19) when per-aggregate order matters.
- **At-least-once delivery**: the send to Kafka and the `published_at` update cannot be atomic either. If the relay crashes after sending and before committing, the rows stay unpublished and are sent again on restart. Duplicates are possible; loss is not. The relay's order is deliberate: send first, mark second.
- **Idempotent consumer**: because of the above, consumers must dedupe. `src/consumer.ts` remembers processed `event_id`s and skips repeats. In real code that set is a `processed_events` table, updated in the same transaction as the consumer's own side effects.
- **Trade-offs vs 11 (CDC relay)**: polling is simple (Postgres + any broker, no Connect, no replication slot), but it adds latency (the poll interval), load on the DB, and a growing table you must clean up (delete or partition published rows). 11 removes all three at the cost of Debezium.

## Proof (`logs/09-outbox-polling.log`)

The app commits two events; bob's rolled back with his order. Before the relay runs, both rows are waiting:

```
 id |    type     | aggregate_id | published_at
  1 | OrderPlaced | 1            |
  2 | OrderPaid   | 1            |
```

Relay pass 1 is killed for real (`process.exit(1)`) after the Kafka send, before its commit. The rows are still unpublished, because the claim transaction died with the process:

```
relay: claimed + sent #1 OrderPlaced, #2 OrderPaid
relay: CRASH after send, before marking published (transaction never commits)
relay exited with 1

 id |    type     | published_at
  1 | OrderPlaced |
  2 | OrderPaid   |
```

Relay pass 2 re-sends them and marks them published:

```
relay: claimed + sent #1 OrderPlaced, #2 OrderPaid
relay: marked 2 published
relay: outbox drained
```

The consumer got each event twice (at-least-once) and processed each once (idempotent):

```
consumer: OrderPlaced key=1 event_id=<placed> payload={"total":"42.50","orderId":1,"customer":"alice"}
consumer: OrderPaid key=1 event_id=<paid> payload={"orderId":1}
consumer: DUPLICATE OrderPlaced event_id=<placed> skipped (idempotent consumer)
consumer: DUPLICATE OrderPaid event_id=<paid> skipped (idempotent consumer)
```

## Origins and further reading

- Article: "Pattern: Transactional outbox", Chris Richardson, microservices.io. https://microservices.io/patterns/data/transactional-outbox.html
- Article: "Pattern: Polling publisher", Chris Richardson, microservices.io. https://microservices.io/patterns/data/polling-publisher.html
- Book: *Microservices Patterns*, Chris Richardson, 2018. https://www.manning.com/books/microservices-patterns
- Article: "Revisiting the Outbox Pattern", Gunnar Morling. https://www.morling.dev/blog/revisiting-the-outbox-pattern/
