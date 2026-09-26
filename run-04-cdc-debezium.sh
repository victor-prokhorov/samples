#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/04-cdc-debezium.log) 2>&1
cd 04-cdc-debezium
echo "# 04-cdc-debezium run $(date -u +%FT%TZ)"
echo "== fresh Postgres + Kafka + Debezium Connect (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
echo "== proof: Postgres runs with logical WAL =="
psql -Atc "SHOW wal_level"
echo "== waiting for Kafka Connect REST API =="
until curl -sf localhost:58083/ >/dev/null; do sleep 2; done
echo "== setup: create orders table + register Debezium connector =="
npm run --silent setup | cut -c1-120
echo "== waiting for connector to open its replication slot =="
until [ "$(psql -Atc "SELECT count(*) FROM pg_replication_slots WHERE active")" = "1" ]; do sleep 2; done
curl -s localhost:58083/connectors/orders-connector/status; echo
echo "== consumer (background) =="
out=$(mktemp)
npm run --silent consume >"$out" 2>&1 &
consumer=$!
until grep -q "subscribed" "$out"; do sleep 1; done
echo "== writer =="
npm run --silent write
echo "== waiting for 5 change events to reach the consumer =="
for _ in $(seq 1 60); do [ "$(grep -c '^consumer: [A-Z]' "$out")" -ge 5 ] && break; sleep 1; done
kill "$consumer" 2>/dev/null || true
grep '^consumer:' "$out"
rm -f "$out"
echo
echo "== proof: replication slot Debezium reads the WAL through (confirmed_flush_lsn advances as it consumes) =="
psql -c "SELECT slot_name, plugin, slot_type, active, confirmed_flush_lsn FROM pg_replication_slots"
echo "== proof: publication pgoutput uses to pick tables =="
psql -c "SELECT * FROM pg_publication_tables"
echo "== proof: Kafka topics (connector created app.public.orders) =="
docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:9092 --list
echo "== proof: orders table now (only bob left) =="
psql -c "SELECT * FROM orders"
