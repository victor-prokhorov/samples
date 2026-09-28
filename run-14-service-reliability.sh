#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/14-service-reliability.log) 2>&1
cd 14-service-reliability
echo "# 14-service-reliability run $(date -u +%FT%TZ)"
echo "== fresh Postgres for the payments service (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: the caller (this process) against payments, a separate process it starts, kills and restarts =="
npm run --silent demo
echo
echo "== proof: charges. alice was charged twice by a retry without a key; bob and carol once each, despite a retry, a concurrent duplicate and a reused key =="
psql -d payments -c "SELECT id, customer, amount, idempotency_key FROM charges ORDER BY id"
psql -d payments -c "SELECT customer, count(*) AS charges, sum(amount) AS total FROM charges GROUP BY customer ORDER BY customer"
echo "== proof: one stored response per key, written in the same transaction as its charge =="
psql -d payments -c "SELECT key, response_status, response_body FROM idempotency_keys ORDER BY created_at"
