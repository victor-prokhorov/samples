#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/outbox.log) 2>&1
cd outbox
echo "# outbox run $(date -u +%FT%TZ)"
echo "== fresh Postgres + Kafka + Debezium Connect (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
echo "== waiting for Kafka Connect REST API =="
until curl -sf localhost:58084/ >/dev/null; do sleep 2; done
echo "== setup: create orders + outbox tables, register Debezium connector with the EventRouter transform =="
npm run --silent setup | cut -c1-120
echo "== waiting for connector to open its replication slot =="
until [ "$(psql -Atc "SELECT count(*) FROM pg_replication_slots WHERE active")" = "1" ]; do sleep 2; done
curl -s localhost:58084/connectors/outbox-connector/status; echo
echo "== consumer (background) =="
out=$(mktemp)
npm run --silent consume >"$out" 2>&1 &
consumer=$!
until grep -q "subscribed" "$out"; do sleep 1; done
echo "== app =="
npm run --silent app
echo
echo "== waiting for 3 events to reach the consumer =="
for _ in $(seq 1 60); do [ "$(grep -c '^consumer: outbox' "$out")" -ge 3 ] && break; sleep 1; done
sleep 3
kill "$consumer" 2>/dev/null || true
grep '^consumer:' "$out"
rm -f "$out"
echo
echo "== proof: orders table (alice shipped, carol committed without an event, no bob) =="
psql -c "SELECT * FROM orders ORDER BY id"
echo "== proof: outbox table is empty (rows were deleted in the same transaction) yet the events were delivered =="
psql -c "SELECT count(*) AS outbox_rows FROM outbox"
echo "== proof: Kafka topics (routed by aggregatetype to outbox.event.order, no raw app.public.outbox topic) =="
docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:9092 --list
echo "== proof: EventRouter transform on the connector =="
curl -s localhost:58084/connectors/outbox-connector/config | tr ',' '\n' | grep transforms
echo
