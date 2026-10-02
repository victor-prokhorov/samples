#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/13-partitioning.log) 2>&1
cd 13-partitioning
echo "# 13-partitioning run $(date -u +%FT%TZ)"
echo "== fresh Postgres (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
npm run --silent demo
echo
echo "== proof: the parent table owns no rows, the partitions do =="
psql -c "SELECT count(*) AS rows_in_parent_only FROM ONLY orders"
psql -c "SELECT tableoid::regclass AS partition, count(*) FROM orders GROUP BY 1 ORDER BY 1"
echo "== proof: every row and where it lives =="
psql -c "SELECT tableoid::regclass AS partition, * FROM orders ORDER BY partition, id"
echo "== proof: partition bounds =="
psql -c "SELECT c.relname, pg_get_expr(c.relpartbound, c.oid) AS bound FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = 'orders'::regclass ORDER BY 1"
