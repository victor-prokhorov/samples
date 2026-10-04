#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/31-runbook" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/31-runbook.log) 2>&1
cd 31-runbook
echo "# 31-runbook run $(date -u +%FT%TZ)"
echo "== fresh Postgres with WAL archiving, no release recorded, no service running, no restore container (docker compose down -v && up) =="
[ -f .run/app.pid ] && ops/service.sh stop >/dev/null || true
rm -rf .run
docker compose --profile drill down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
echo "== demo: runbooks in Markdown, executed by src/runner.ts, against Postgres and the member service on :53041 =="
npm run --silent demo
echo
echo "== proof: ops.runs, one row per runbook run (run 10 is the rollback that release run 9 started; 12 and 13 ran inside drill 11) =="
psql -c "SELECT id, runbook, params, operator, parent, outcome, round(extract(epoch FROM finished_at - started_at)::numeric, 1) AS seconds FROM ops.runs ORDER BY id"
echo "== proof: ops.steps that did not succeed, with the tail of their output =="
psql -c "SELECT run_id, section, step, status, exit_code, right(regexp_replace(output, '\s+', ' ', 'g'), 80) AS output FROM ops.steps WHERE status <> 'ok' ORDER BY id"
echo "== proof: schema_migrations (003 applied by run 9, removed by run 10) =="
psql -c "SELECT version, name, applied_at::time(0) FROM schema_migrations ORDER BY version"
echo "== proof: import_batches and member_changes (one batch for 2026-09 despite three runs, 2026-10 loaded inside the drill; each change carries ticket and operator, o'brien stored as typed) =="
psql -c "SELECT id, period, file, left(sha256, 12) AS sha256, rows, total FROM import_batches"
psql -c "SELECT member_id, field, old_value, new_value, ticket, operator FROM member_changes"
echo "== proof: the drill, step by step (seconds per step; the RTO clock runs from step 5 to the end of verification) =="
psql -c "SELECT section, step, status, seconds FROM ops.steps WHERE run_id = (SELECT id FROM ops.runs WHERE runbook = 'runbooks/backup-restore-drill.md') ORDER BY id"
echo "== proof: contributions after the drill, per period and batch (2026-10 was loaded after the base backup) =="
psql -c "SELECT period, batch_id, count(*) AS rows, sum(amount) AS total FROM contributions GROUP BY 1, 2 ORDER BY 1"
echo "== proof: the WAL archive the restore replayed, and the archiver's counters =="
docker compose exec -T postgres ls -l /drill/wal | awk 'NR > 1 {print $5, $9}'
psql -c "SELECT archived_count, last_archived_wal, failed_count FROM pg_stat_archiver"
echo "== proof: no restore container left =="
echo "restore containers: $(docker compose --profile drill ps -aq restore | wc -l)"
echo "== proof: what the release left on disk =="
ls .run | grep -v '\.pid$'
cat .run/current
