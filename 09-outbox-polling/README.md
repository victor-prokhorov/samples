# 09-outbox-polling

**Pain: dual write.** The app must update its database and tell Kafka, two systems with no shared transaction. A crash between the two writes loses the event or publishes one for a change that never committed.

**Reach for it when** a service changes its own database and must reliably tell others what happened in business terms (`OrderPlaced`), and consumers can handle a duplicate: delivery is at least once. Start here; a polling relay covers most volumes.

**Do not reach for it when** consumers want every row change from any writer, not business events (10). Losing a notification is acceptable: publish best effort. The caller needs the other side's answer before it can reply: that is a synchronous call, not an event. Poll latency, query load or table cleanup already hurt (11).

Transactional outbox with the simplest relay: a polling loop. The app writes the business row and an `outbox` row in one transaction. `src/relay.ts` claims unpublished rows with `FOR UPDATE SKIP LOCKED`, sends them to Kafka, then sets `published_at`. Postgres + Kafka only, no Debezium.

```sh
docker compose up -d --wait
npm i
npm run setup     # orders + outbox tables, Kafka topic
npm run consume   # terminal 1: idempotent consumer, dedupes by event_id header
npm run app       # terminal 2: writes orders + outbox rows
npm run relay     # drain the outbox to Kafka (add -- --crash-after-send to simulate a crash)
```

- Send first, mark published second: a crash in between means duplicates, never loss (at-least-once).
- `SKIP LOCKED` lets several relays run at once without double-claiming rows, at the cost of per-aggregate ordering.

One-shot run with proof: `../run-09-outbox-polling.sh` (log in `../logs/09-outbox-polling.log`). Concepts explained in `../README.md`.
