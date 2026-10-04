#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/15-multi-tenancy" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/15-multi-tenancy.log) 2>&1
cd 15-multi-tenancy
echo "# 15-multi-tenancy run $(date -u +%FT%TZ)"
echo "== fresh Postgres with databases pool, bridge, silo_initech, silo_umbrella (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== pool: shared tables, tenant_id, Row-Level Security =="
npm run --silent demo
echo
echo "== proof: whom RLS applies to. app is neither superuser nor BYPASSRLS nor owner; the owner only since FORCE =="
psql -d pool -c "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('postgres', 'migrator', 'app') ORDER BY 1"
psql -d pool -c "SELECT relname, relowner::regrole AS owner, relrowsecurity AS rls, relforcerowsecurity AS forced FROM pg_class WHERE relname IN ('customers', 'invoices') ORDER BY 1"
psql -d pool -c "SELECT tablename, policyname, qual, with_check FROM pg_policies ORDER BY 1"
echo "== proof: every key and index of invoices that tenants use leads with tenant_id =="
psql -d pool -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'invoices'::regclass ORDER BY 1"
psql -d pool -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'invoices' ORDER BY 1"
echo "== proof: psql as app with no tenant set sees nothing; psql as postgres (superuser) sees everyone =="
docker compose exec -T postgres psql -U app -d pool -c "SELECT count(*) AS invoices_visible_to_app FROM invoices"
psql -d pool -c "SELECT tenant_id, count(*) FROM invoices GROUP BY 1 ORDER BY 1"
echo "== bridge: one schema per tenant =="
npm run --silent bridge
echo
echo "== proof: migration versions per schema, and migration 2 applied in t_initrode =="
psql -d bridge -c "SELECT 't_hooli' AS schema, max(version) FROM t_hooli.schema_migrations UNION ALL SELECT 't_initrode', max(version) FROM t_initrode.schema_migrations UNION ALL SELECT 't_vandelay', max(version) FROM t_vandelay.schema_migrations"
psql -d bridge -c "\d t_initrode.invoices"
psql -d bridge -c "SELECT count(*) AS tenant_schemas FROM pg_namespace WHERE nspname LIKE 't\_%'"
echo "== silo: one database per tenant, and moving bigco out of the pool =="
npm run --silent silo
echo
echo "== proof: the directory after the move and the delete =="
psql -d pool -c "SELECT * FROM tenants ORDER BY id"
echo "== proof: databases now (silo_umbrella dropped, silo_bigco created) =="
psql -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) AS size FROM pg_database WHERE datname NOT LIKE 'template%' ORDER BY 1"
echo "== proof: bigco's rows left the pool and live in silo_bigco =="
psql -d pool -c "SELECT tenant_id, count(*) FROM invoices GROUP BY 1 ORDER BY 1"
psql -d silo_bigco -c "SELECT tenant_id, count(*), max(id) FROM invoices GROUP BY 1"
echo "== proof: restore one tenant. dump silo_initech, lose its invoices, restore that database alone =="
docker compose exec -T postgres pg_dump -U postgres -Fc -f /tmp/silo_initech.dump silo_initech
psql -d silo_initech -c "DELETE FROM invoices"
docker compose exec -T postgres pg_restore -U postgres --clean --if-exists --single-transaction -d silo_initech /tmp/silo_initech.dump
psql -d silo_initech -c "SELECT tenant_id, number, amount_cents FROM invoices ORDER BY id"
psql -d silo_initech -c "SELECT tablename, policyname FROM pg_policies ORDER BY 1"
