#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/43-data-subject-export.log) 2>&1
cd 43-data-subject-export
echo "# 43-data-subject-export run $(date -u +%FT%TZ)"
echo "== fresh Postgres (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent typecheck
npm run --silent setup
echo "== demo: inventory check, re-authentication, export of M0042, deadline, retention purge (portal on :53053, clock fixed at 2026-10-03T09:00Z) =="
status=0
npm run --silent demo || status=$?
echo
echo "== proof: the inventory check as CI runs it, on the schema left by the demo =="
npm run --silent check-inventory
echo "== proof: dsar_requests and the timeline of the new request =="
psql -c "SELECT id, member_id, kind, received_at, due_on, status, completed_at, left(export_sha256, 16) AS export_sha256 FROM dsar_requests ORDER BY id"
psql -c "SELECT request_id, at, event, detail FROM dsar_events WHERE request_id = (SELECT max(id) FROM dsar_requests) ORDER BY id"
echo "== proof: the zip, listed by unzip, and the committed files =="
unzip -l out/export-M0042.zip
sha256sum out/export-M0042.zip
echo "== proof: out/export-M0042/csv/beneficiaries.csv (no third-party birth dates) and the head of contributions.csv =="
cat out/export-M0042/csv/beneficiaries.csv
head -4 out/export-M0042/csv/contributions.csv
echo "== proof: retention_policies =="
psql -c "SELECT seq, table_name, keep, anchor_label, action, why FROM retention_policies ORDER BY seq"
echo "== proof: purge_runs, the first run per policy, then both runs' totals (the second purged nothing) =="
psql -c "SELECT id, table_name, action, purged, held, batches FROM purge_runs WHERE id <= (SELECT count(*) FROM retention_policies) ORDER BY id"
psql -c "SELECT (id - 1) / (SELECT count(*) FROM retention_policies) + 1 AS run, sum(purged) AS purged, sum(held) AS held, sum(batches) AS batches FROM purge_runs GROUP BY 1 ORDER BY 1"
echo "== proof: what an anonymised member looks like, and the member under a legal hold =="
psql -c "SELECT id, member_no, given_name, email, national_id, birth_date, postcode, employer_id, joined_on, left_on FROM members WHERE anonymised_at IS NOT NULL ORDER BY id LIMIT 3"
psql -c "SELECT h.reason, m.member_no, m.given_name, m.left_on, (SELECT count(*) FROM contributions c WHERE c.member_id = m.id) AS contributions FROM legal_holds h JOIN members m ON m.id = h.member_id"
echo "== screenshot: out/export-M0042/index.html =="
(cd ../tools && npm install --silent --no-audit --no-fund)
node --input-type=module -e "import { shot } from '../tools/render.mjs'; await shot('file://$PWD/out/export-M0042/index.html', 'screenshots/export-index.png', { width: 1000, height: 1250, fullPage: false });"
ls -l screenshots/export-index.png | awk '{print $5, $9}'
exit $status
