#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/09-outbox-polling.log) 2>&1
cd 09-outbox-polling
echo "# 09-outbox-polling run $(date -u +%FT%TZ)"
echo "== fresh Postgres + Kafka (docker compose down -v && up), no Debezium =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== consumer (background, stops after 4 deliveries and checks them against the outbox) =="
out=$(mktemp)
npm run --silent consume -- --messages 4 >"$out" 2>&1 &
consumer=$!
until grep -q "subscribed" "$out"; do kill -0 "$consumer" 2>/dev/null || { cat "$out"; echo "consumer died"; exit 1; }; sleep 1; done
echo "== app =="
npm run --silent app
echo
echo "== proof: outbox rows waiting for the relay (published_at is null) =="
psql -c "SELECT id, type, aggregate_id, published_at FROM outbox ORDER BY id"
echo "== relay pass 1: crashes after sending to Kafka, before marking published =="
code=0
npm run --silent relay -- --crash-after-send || code=$?
echo "relay exited with $code (3 is the simulated crash)"
[ "$code" = 3 ] || exit 1
echo "== proof: rows are still unpublished, the crashed transaction rolled back =="
psql -c "SELECT id, type, published_at FROM outbox ORDER BY id"
npm run --silent verify -- crashed
echo "== relay pass 2: restarts, re-sends the same rows, marks them published =="
npm run --silent relay
echo "== proof: every row now has published_at =="
psql -c "SELECT id, type, published_at IS NOT NULL AS published FROM outbox ORDER BY id"
npm run --silent verify -- drained
echo "== consumer output: 2 events, then the same 2 again from pass 2, skipped by event_id =="
for _ in $(seq 1 60); do kill -0 "$consumer" 2>/dev/null || break; sleep 1; done
kill -0 "$consumer" 2>/dev/null && { kill "$consumer"; echo "consumer: still waiting for 4 deliveries after 60s"; }
code=0
wait "$consumer" || code=$?
grep -v "subscribed" "$out" | grep -v '^{"level"' || true
rm -f "$out"
[ "$code" = 0 ] || exit 1
echo
echo "== proof: orders table (alice paid, no bob) =="
psql -c "SELECT * FROM orders ORDER BY id"
