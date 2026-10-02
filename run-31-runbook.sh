#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/31-runbook.log) 2>&1
cd 31-runbook
echo "# 31-runbook run $(date -u +%FT%TZ)"
echo "== fresh Postgres, no release recorded, no service running (docker compose down -v && up) =="
[ -f .run/app.pid ] && ops/service.sh stop >/dev/null || true
rm -rf .run
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
echo "== demo: runbooks in Markdown, executed by src/runner.ts, against Postgres and the member service on :53041 =="
npm run --silent demo
echo
echo "== proof: ops.runs, one row per runbook run (run 10 is the rollback that release run 9 started) =="
psql -c "SELECT id, runbook, params, operator, parent, outcome, round(extract(epoch FROM finished_at - started_at)::numeric, 1) AS seconds FROM ops.runs ORDER BY id"
echo "== proof: ops.steps that did not succeed, with the tail of their output =="
psql -c "SELECT run_id, section, step, status, exit_code, right(regexp_replace(output, '\s+', ' ', 'g'), 80) AS output FROM ops.steps WHERE status <> 'ok' ORDER BY id"
echo "== proof: schema_migrations (003 applied by run 9, removed by run 10) =="
psql -c "SELECT version, name, applied_at::time(0) FROM schema_migrations ORDER BY version"
echo "== proof: import_batches and member_changes (one batch despite three runs; each change carries ticket and operator, o'brien stored as typed) =="
psql -c "SELECT id, period, file, left(sha256, 12) AS sha256, rows, total FROM import_batches"
psql -c "SELECT member_id, field, old_value, new_value, ticket, operator FROM member_changes"
echo "== proof: what the release left on disk =="
ls .run | grep -v '\.pid$'
cat .run/current
