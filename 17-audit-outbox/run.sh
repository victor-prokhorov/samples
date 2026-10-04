#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/17-audit-outbox" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/17-audit-outbox.log) 2>&1
cd 17-audit-outbox
echo "# 17-audit-outbox run $(date -u +%FT%TZ)"
echo "== fresh Postgres with databases orders, billing, audit (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: app writes, each with its audit event in the same transaction =="
npm run --silent demo
echo
echo "== yolo: a manual UPDATE in psql, outside the app =="
psql -d orders -c "UPDATE orders SET total = 0 WHERE id = 1"
echo "== proof: audit events waiting in each service's outbox (no row for mallory's rolled-back change, none for the psql UPDATE) =="
psql -d orders -c "SELECT id, entity, entity_id, action, actor, shipped_at FROM audit_outbox ORDER BY id"
psql -d billing -c "SELECT id, entity, entity_id, action, actor, shipped_at FROM audit_outbox ORDER BY id"
echo "== shipper pass 1: stores the orders events centrally, crashes before marking them shipped =="
code=0
npm run --silent ship -- --crash-after-send || code=$?
echo "shipper exited with $code (3 is the simulated crash)"
[ "$code" = 3 ] || exit 1
echo "== proof: orders rows still unshipped locally (the crashed transaction rolled back), yet already stored centrally =="
psql -d orders -c "SELECT id, shipped_at FROM audit_outbox ORDER BY id"
psql -d audit -c "SELECT count(*) AS stored_centrally FROM audit_events"
npm run --silent verify -- crashed
echo "== shipper pass 2: re-sends the orders events (deduped by event_id), then the billing ones =="
npm run --silent ship
echo
echo "== proof: central timeline across services, one row per event despite the re-send =="
psql -d audit -c "SELECT service, source_id, entity, entity_id, action, actor, reason, before, after FROM audit_events ORDER BY occurred_at, service"
echo "== proof: the central log is append-only =="
psql -d audit -c "UPDATE audit_events SET actor = 'nobody' WHERE actor = 'bob (support)'" || true
psql -d audit -c "DELETE FROM audit_events" || true
psql -d audit -c "TRUNCATE audit_events" || true
echo "== proof: the gap. orders says total 0, the audit trail's last word is 38.25 (the psql UPDATE left no trace) =="
psql -d orders -c "SELECT * FROM orders"
psql -d audit -c "SELECT after->>'total' AS last_audited_total FROM audit_events WHERE entity = 'order' AND entity_id = '1' ORDER BY occurred_at DESC LIMIT 1"
echo "== proof: local outboxes are drained; shipped rows can now be deleted on a retention schedule =="
psql -d orders -c "SELECT count(*) FILTER (WHERE shipped_at IS NULL) AS unshipped, count(*) AS total FROM audit_outbox"
psql -d billing -c "SELECT count(*) FILTER (WHERE shipped_at IS NULL) AS unshipped, count(*) AS total FROM audit_outbox"
npm run --silent verify -- final
