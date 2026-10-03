#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/41-crm-integration.log) 2>&1
cd 41-crm-integration
echo "# 41-crm-integration run $(date -u +%FT%TZ)"
echo "== fresh Postgres for the domain app's local copy (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent typecheck
npm run --silent setup
echo "== demo: a fake CRM (OData API, faults, signed webhooks) on :53151, the domain app on :53051 =="
status=0
npm run --silent demo || status=$?
echo
echo "== proof: the domain tables hold domain values only (status words, employer refs, no GUIDs, no option-set codes) =="
psql -c "SELECT employer_ref, status, count(*) AS members FROM members GROUP BY 1, 2 ORDER BY 1, 2"
psql -c "SELECT * FROM members WHERE member_no IN ('M0004', 'M0007', 'M0010', 'M0020', 'M0021', 'M0040', 'M0050') ORDER BY member_no"
echo "== proof: quarantine, the CRM records the translator or the domain refused =="
psql -c "SELECT raw->>'New_MemberNo' AS member_no, source_id, version, reasons FROM quarantine ORDER BY source_id"
echo "== proof: sync_runs, the high-water mark moving forward =="
psql -c "SELECT id, mark_before, mark_after, fetched, applied, unchanged, removed, rejected FROM sync_runs ORDER BY id"
echo "== proof: webhook_inbox (one row per event id, deliveries counted) and webhook_refusals =="
psql -c "SELECT left(event_id, 8) AS event, source_id, deliveries, outcome FROM webhook_inbox ORDER BY first_seen"
psql -c "SELECT id, reason FROM webhook_refusals ORDER BY id"
echo "== proof: reconciliation_runs =="
psql -c "SELECT id, source_active, source_valid, quarantined, local_count, left(source_checksum, 12) AS crm_sum, left(local_checksum, 12) AS local_sum, missing_locally, extra_locally, differing FROM reconciliation_runs ORDER BY id"
echo "== proof: the naive table, CRM values copied as they came =="
psql -c "SELECT count(*) AS rows, count(*) FILTER (WHERE email NOT LIKE '%@%') AS email_without_at, count(*) FILTER (WHERE member_no IS NULL) AS no_member_no FROM naive_members"
echo "== screenshot: out/reconciliation.html =="
(cd ../tools && npm install --silent --no-audit --no-fund)
node ../tools/render.mjs html out/reconciliation.html screenshots/reconciliation-drift.png 1000
ls -l out/reconciliation.html out/reconciliation.json screenshots/reconciliation-drift.png | awk '{print $5, $9}'
exit $status
