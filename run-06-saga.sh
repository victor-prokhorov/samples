#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/06-saga.log) 2>&1
cd 06-saga
echo "# 06-saga run $(date -u +%FT%TZ)"
echo "== fresh Postgres with one database per service (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo (the process is killed in scenario 4) =="
npm run --silent demo || echo "demo exited with $?"
echo "== proof: saga log right after the crash (order-D stuck at step 1 although its charge exists) =="
psql -d orchestrator -c "SELECT id, state, step, error FROM sagas ORDER BY id"
psql -d payments -c "SELECT * FROM charges WHERE saga_id = 'order-D'"
echo "== resume in a new process =="
npm run --silent resume
echo
echo "== proof: saga log =="
psql -d orchestrator -c "SELECT id, state, step, error FROM sagas ORDER BY id"
echo "== proof: inventory (10 - 2 for A - 1 for D = 7; B and C released) =="
psql -d inventory -c "SELECT * FROM stock" -c "SELECT * FROM reservations ORDER BY saga_id"
echo "== proof: payments (C refunded, D charged exactly once despite running the step twice, B never charged) =="
psql -d payments -c "SELECT * FROM charges ORDER BY saga_id"
echo "== proof: shipping (only the completed sagas) =="
psql -d shipping -c "SELECT * FROM shipments ORDER BY saga_id"
