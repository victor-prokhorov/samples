#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/16-serializable" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/16-serializable.log) 2>&1
cd 16-serializable
echo "# 16-serializable run $(date -u +%FT%TZ)"
echo "== fresh Postgres (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: 20 concurrent buyers per scenario, 10 items available =="
npm run --silent demo
echo
echo "== proof: last scenario (row lock), exactly 10 tickets, 10 distinct buyers =="
psql -c "SELECT count(*) AS tickets, count(DISTINCT buyer) AS buyers FROM tickets WHERE event_id = 'concert'"
