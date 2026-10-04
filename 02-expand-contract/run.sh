#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/02-expand-contract" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/02-expand-contract.log) 2>&1
cd 02-expand-contract
echo "# 02-expand-contract run $(date -u +%FT%TZ)"
echo "== fresh Postgres (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
echo "== demo: rename users.name -> display_name while old and new app versions run side by side =="
npm run --silent start
echo
echo "== proof: final schema has only display_name, NOT NULL =="
docker compose exec -T postgres psql -U postgres -c "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position"
echo "== proof: every row written by every version across all phases has a display_name =="
docker compose exec -T postgres psql -U postgres -c "SELECT id, display_name FROM users ORDER BY id"
