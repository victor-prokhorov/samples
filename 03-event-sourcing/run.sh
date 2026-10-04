#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/03-event-sourcing" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/03-event-sourcing.log) 2>&1
cd 03-event-sourcing
echo "# 03-event-sourcing run $(date -u +%FT%TZ)"
echo "== fresh Postgres (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
echo "== demo =="
npm run --silent start
echo
echo "== proof: raw events table (append-only, one row per fact) =="
docker compose exec -T postgres psql -U postgres -c "SELECT global_position, stream_id, version, type, data FROM events ORDER BY global_position"
echo "== proof: the unique constraint that enforces optimistic concurrency =="
docker compose exec -T postgres psql -U postgres -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'events'::regclass AND contype = 'u'"
