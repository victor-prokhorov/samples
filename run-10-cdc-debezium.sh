#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/10-cdc-debezium.log) 2>&1
cd 10-cdc-debezium
echo "# 10-cdc-debezium run $(date -u +%FT%TZ)"
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
echo "== consumer (background, stops after 5 events and checks them) =="
out=$(mktemp)
npm run --silent consume -- --messages 5 >"$out" 2>&1 &
consumer=$!
until grep -q "subscribed" "$out"; do kill -0 "$consumer" 2>/dev/null || { cat "$out"; echo "consumer died"; exit 1; }; sleep 1; done
echo "== writer =="
npm run --silent write
echo "== waiting for 5 change events to reach the consumer =="
for _ in $(seq 1 60); do kill -0 "$consumer" 2>/dev/null || break; sleep 1; done
kill -0 "$consumer" 2>/dev/null && { kill "$consumer"; echo "consumer: still waiting for 5 events after 60s"; }
code=0
wait "$consumer" || code=$?
grep -v "subscribed" "$out" | grep -v '^{"level"' || true
rm -f "$out"
[ "$code" = 0 ] || exit 1
echo
sleep 3
echo "== proof: replication slot Debezium reads the WAL through (confirmed_flush_lsn = last position Debezium acknowledged on an offset flush; Postgres may discard WAL before it) =="
psql -c "SELECT slot_name, plugin, slot_type, active, confirmed_flush_lsn, confirmed_flush_lsn - '0/0' AS as_number FROM pg_replication_slots"
echo "== proof: transaction outcomes (737 is the DELETE bob + ROLLBACK) =="
psql -c "SELECT t AS tx, pg_xact_status(t::text::xid8) FROM (VALUES (734), (735), (736), (737), (738)) v(t)"
echo "== proof: publication pgoutput uses to pick tables =="
psql -c "SELECT * FROM pg_publication_tables"
echo "== proof: Kafka topics (app.public.orders, pre-created by the consumer; the connector would create it on its first event) =="
docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:9092 --list
echo "== proof: orders table now (only bob left) =="
psql -c "SELECT * FROM orders"
