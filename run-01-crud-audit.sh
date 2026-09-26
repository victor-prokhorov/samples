#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/01-crud-audit.log) 2>&1
cd 01-crud-audit
echo "# 01-crud-audit run $(date -u +%FT%TZ)"
echo "== fresh Postgres (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
echo "== demo =="
npm run --silent start
echo
echo "== proof: products table (current state only, row is gone) =="
docker compose exec -T postgres psql -U postgres -c "SELECT * FROM products"
echo "== proof: audit_log table (full history survives the delete, rolled-back change absent) =="
docker compose exec -T postgres psql -U postgres -c "SELECT id, entity, entity_id, action, actor, before, after FROM audit_log ORDER BY id"
