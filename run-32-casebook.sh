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
# mermaid-cli renders through puppeteer, which takes the browser from PUPPETEER_EXECUTABLE_PATH; unless it is set, use the newest local Playwright Chromium
if [ -z "${PUPPETEER_EXECUTABLE_PATH:-}" ]; then
  for dir in "${PLAYWRIGHT_BROWSERS_PATH:-}" "$HOME/.cache/ms-playwright" /opt/pw-browsers; do
    chrome=$(ls -d "$dir"/chromium-*/chrome-linux*/chrome 2>/dev/null | sort -V | tail -1 || true)
    if [ -n "$dir" ] && [ -n "$chrome" ]; then export PUPPETEER_EXECUTABLE_PATH="$chrome"; break; fi
  done
fi
[ -n "${PUPPETEER_EXECUTABLE_PATH:-}" ] || { echo "no Chromium found: set PUPPETEER_EXECUTABLE_PATH"; exit 1; }
echo "== Chromium for mermaid-cli: $(basename "$(dirname "$(dirname "$PUPPETEER_EXECUTABLE_PATH")")") (PUPPETEER_EXECUTABLE_PATH) =="
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
echo "== demo: the design case in casebook/*.md, checked: traceability, diagrams, data model =="
npm run --silent demo
echo
echo "== proof: change_requests after the journeys (CR-1002 reviewed, approved and applied by dan; CR-1001 still waits for a second approver) =="
psql -c "SELECT reference, member_id, type, status, first_approver, second_approver, payload FROM change_requests ORDER BY id"
echo "== proof: audit_log and outbox written in the same transactions =="
psql -c "SELECT member_id, change_request_id, actor, before, after FROM audit_log"
psql -c "SELECT id, topic, payload FROM outbox ORDER BY id"
echo "== proof: the constraints that carry the rules (REQ-05, REQ-11), the row-level security per table (REQ-10, REQ-16) and portal_app's sequence grants =="
psql -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'change_requests'::regclass AND contype = 'c' ORDER BY conname"
psql -c "SELECT c.relname AS table, c.relrowsecurity AS rls, p.policyname, p.qual FROM pg_class c LEFT JOIN pg_policies p ON p.tablename = c.relname WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace ORDER BY 1"
psql -c "SELECT sequencename, has_sequence_privilege('portal_app', sequencename, 'USAGE') AS portal_app_usage FROM pg_sequences ORDER BY 1"
echo "== proof: the committed SVGs =="
# The Mermaid renders are numbered after their chapter; diagrams/overview.svg is the hand-built overview, not a Mermaid render.
for f in diagrams/[0-9]*.svg; do printf '%-44s %7d bytes  %s\n' "$f" "$(wc -c < "$f")" "$(grep -o 'aria-roledescription="[^"]*"' "$f" | head -1)"; done
