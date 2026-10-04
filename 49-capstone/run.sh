#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/49-capstone" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p ../logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee ../logs/49-capstone.log) 2>&1
echo "# 49-capstone run $(date -u +%FT%TZ)"
echo "== fresh Postgres for the portal (docker compose down -v && up) and no earlier build =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
rm -rf .next test-results
npm install --silent --no-audit --no-fund
export NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== unit tests (Vitest): IBAN rules, the authorization policy, the catalogues and Intl formats =="
npx vitest run --reporter=verbose
echo "== build: next build. Every page reads the session cookie, so every route is dynamic (ƒ), rendered per request =="
npm run --silent build
echo "== journeys (@playwright/test): the IdP and next start as web servers, one worker, axe on every page =="
npx playwright test
echo "== fresh data for the demo: setup again =="
npm run --silent setup
echo "== demo: the three journeys in Chromium, step by step, with checks, axe and the screenshots (IdP on :53159, portal on :53059) =="
npm run --silent demo
echo
echo "== proof: users, provisioned at their first sign-in from the ID token; the role comes from the IdP group =="
psql -c "SELECT * FROM role_mappings ORDER BY role, idp_group"
psql -c "SELECT sub, name, role, org_id, member_id FROM users ORDER BY first_login_at"
echo "== proof: sessions hold the sha256 of each cookie, never the cookie; no login transaction left behind =="
psql -c "SELECT left(id_hash, 16) AS id_hash_prefix, user_sub, expires_at - created_at AS lifetime FROM sessions ORDER BY created_at"
psql -c "SELECT count(*) AS login_transactions_left FROM login_transactions"
echo "== proof: change requests of the last day. Ana's approved by sam; the one sam filed for Gil still pending (four eyes) =="
psql -c "SELECT id, member_id, requested_by, status, approved_by, value->>'iban' AS iban FROM change_requests WHERE created_at > now() - interval '1 day' ORDER BY id"
echo "== proof: the trigger applied the approved IBAN to Ana's member record =="
psql -c "SELECT id, name, holder, iban FROM members WHERE id = 'M0001'"
echo "== proof: the RLS policies, and the app role the portal logs in as (not a superuser, no BYPASSRLS) =="
psql -c "SELECT tablename, policyname, cmd, regexp_replace(coalesce(qual, ''), '\s+', ' ', 'g') AS using, regexp_replace(coalesce(with_check, ''), '\s+', ' ', 'g') AS with_check FROM pg_policies ORDER BY tablename, cmd"
psql -c "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('app', 'postgres') ORDER BY rolname"
echo "== proof: the usage events the demo's journeys recorded (the seeded history has sessions named h-...) =="
psql -c "SELECT name, count(*) AS events, string_agg(DISTINCT user_sub, ', ') AS users FROM events WHERE session NOT LIKE 'h-%' GROUP BY name ORDER BY name"
echo "== proof: screenshots (bytes) =="
ls -l screenshots/*.png | awk '{print $5, $9}'
