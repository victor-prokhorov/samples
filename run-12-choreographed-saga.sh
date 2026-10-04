#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/12-choreographed-saga.log) 2>&1
cd 12-choreographed-saga
echo "# 12-choreographed-saga run $(date -u +%FT%TZ)"
echo "== fresh Postgres with one database per service + Kafka (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
lag() { docker compose exec -T kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group "$1" 2>/dev/null | awk -v g="$1" -v t="$2" '$1 == "GROUP" || ($1 == g && (t == "" || $2 == t)) { printf "%-17s %-9s %-14s %-14s %s\n", $2, $3, $4, $5, $6 }' | LC_ALL=C sort; }
npm run --silent setup
echo "== demo (the inventory consumer is killed in scenario 5) =="
code=0
npm run --silent demo || code=$?
echo "demo exited with $code (3 is the simulated crash; 1 would be a failed check)"
[ "$code" = 3 ] || exit 1
echo
echo "== proof: no dual write. inventory's reservation, its InventoryReserved outbox row and the processed OrderPlaced committed together =="
psql -d inventory -c "SELECT * FROM reservations WHERE order_id = 'order-D'" -c "SELECT type, order_id, published_at FROM outbox WHERE order_id = 'order-D'" -c "SELECT type, order_id FROM processed_messages WHERE order_id = 'order-D'"
echo "== proof: yet the inventory consumer group has no committed offset on partition 1, where OrderPlaced for order-D sits at offset 0, so a restart reads it again =="
lag inventory order-events
echo "== proof: orders table right after the crash (order-D stuck in pending) =="
psql -d orders -c "SELECT id, status FROM orders ORDER BY id"
echo "== resume: restart every service in a new process =="
npm run --silent resume
echo
echo "== proof: every consumer group is caught up =="
for g in orders inventory payments shipping; do lag "$g" "" | awk -v g="$g" '$1 != "TOPIC" { n++; l += $5 } END { printf "group %-9s total lag %d across %d partitions\n", g, l, n }'; done
npm run --silent timeline -- order-C order-D order-E
echo
echo "== proof: orders (D completed after the restart, E completed despite the late event) =="
psql -d orders -c "SELECT id, status FROM orders ORDER BY id"
echo "== proof: inventory (10 - 2 for A - 1 for D - 1 for E = 6; B and C released; D reserved once despite the redelivery) =="
psql -d inventory -c "SELECT * FROM stock" -c "SELECT * FROM reservations ORDER BY order_id"
echo "== proof: payments (C refunded, B never charged) =="
psql -d payments -c "SELECT * FROM charges ORDER BY order_id"
echo "== proof: shipping (only A, D, E) =="
psql -d shipping -c "SELECT * FROM shipments ORDER BY order_id"
echo "== proof: inventory processed OrderPlaced for order-D once, although Kafka delivered it twice =="
psql -d inventory -c "SELECT type, order_id FROM processed_messages WHERE order_id = 'order-D'"
echo "== proof: every outbox drained =="
for db in orders inventory payments shipping; do psql -d "$db" -tA -c "SELECT '$db: ' || count(*) FILTER (WHERE published_at IS NULL) || ' unpublished of ' || count(*) FROM outbox"; done
npm run --silent verify
