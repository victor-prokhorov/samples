#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/32-casebook.log) 2>&1
cd 32-casebook
echo "# 32-casebook run $(date -u +%FT%TZ)"
echo "== fresh Postgres for the data model (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
rm -rf build
PUPPETEER_SKIP_DOWNLOAD=1 npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
echo "== demo: the design case in casebook/*.md, checked: traceability, diagrams, data model =="
npm run --silent demo
echo
echo "== proof: change_requests after the journeys (CR-1002 reviewed, approved and applied by dan; CR-1001 still waits for a second approver) =="
psql -c "SELECT reference, member_id, type, status, first_approver, second_approver, payload FROM change_requests ORDER BY id"
echo "== proof: audit_log and outbox written in the same transactions =="
psql -c "SELECT member_id, change_request_id, actor, before, after FROM audit_log"
psql -c "SELECT id, topic, payload FROM outbox ORDER BY id"
echo "== proof: the constraints that carry the rules (REQ-05, REQ-11) and the row-level security policy (REQ-10) =="
psql -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'change_requests'::regclass AND contype = 'c' ORDER BY conname"
psql -c "SELECT policyname, qual FROM pg_policies WHERE tablename = 'members'"
echo "== proof: the committed SVGs =="
for f in diagrams/*.svg; do printf '%-44s %7d bytes  %s\n' "$f" "$(wc -c < "$f")" "$(grep -o 'aria-roledescription="[^"]*"' "$f" | head -1)"; done
