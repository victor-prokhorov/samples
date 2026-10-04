#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/20-portal" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/20-portal.log) 2>&1
cd 20-portal
echo "# 20-portal run $(date -u +%FT%TZ)"
echo "== fresh Postgres for the portal (docker compose down -v && up) and no earlier build =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
rm -rf .next
npm install --silent --no-audit --no-fund
export NEXT_TELEMETRY_DISABLED=1
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== build: next build. Pages that read the session cookie are dynamic (ƒ), rendered per request on the server =="
npm run --silent build
echo "== demo: a client with JavaScript off (HTTP and a cookie jar) against next start, a separate process it starts and stops =="
npm run --silent demo
echo
echo "== proof: members with their employer and current address (each page above showed one member's row only) =="
psql -c "SELECT m.id, m.username, m.full_name, e.name AS employer, a.line1, a.city, a.postcode FROM members m JOIN employers e ON e.id = m.employer_id JOIN addresses a ON a.member_id = m.id ORDER BY m.id"
echo "== proof: change_requests. One row: the invalid, duplicate and cross-origin posts wrote nothing; member_id is alice's despite the forged field =="
psql -c "SELECT id, member_id, kind, payload, effective_from, status FROM change_requests ORDER BY id"
echo "== proof: the rule behind step 6 =="
psql -c "SELECT indexdef FROM pg_indexes WHERE indexname = 'one_pending_change_per_member'"
echo "== screenshots: the member pages in Chromium, signed in as alice (next start again, in the background) =="
(cd ../tools && npm install --silent --no-audit --no-fund)
rm -f screenshots/*.png
setsid node_modules/.bin/next start -p 53030 >/dev/null 2>&1 &
NEXT=$!
trap 'kill -- -$NEXT 2>/dev/null || true; scrub_paths' EXIT
for _ in $(seq 100); do curl -sf -o /dev/null http://localhost:53030/login && break; sleep 0.2; done
node screenshots/take.mjs
kill -- -$NEXT
for f in screenshots/*.png; do echo "$f $(wc -c < "$f") bytes"; done
