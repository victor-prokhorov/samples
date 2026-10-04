#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/37-authorization" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/37-authorization.log) 2>&1
cd 37-authorization
echo "# 37-authorization run $(date -u +%FT%TZ)"
echo "== fresh Postgres (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
npm --prefix ../tools install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: the sprinkled app, one policy, the matrix, the policy app, RLS cell by cell, the bug only RLS catches (HTTP on :53047) =="
npm run --silent demo
echo
echo "== tests: the matrix against hand-written expectations, code against RLS on every cell (vitest) =="
npx vitest run --reporter=verbose
echo "== screenshot: out/matrix.html =="
node ../tools/render.mjs html out/matrix.html screenshots/matrix.png 1280
ls -l screenshots/matrix.png | awk '{print $5, $9}'
echo "== proof: role checks per file (lines comparing user.role) =="
for f in src/sprinkled.ts src/app.ts src/policy.ts; do echo "$f: $(grep -cE '\.role [!=]==' "$f" || true)"; done
echo "== proof: the RLS policies as Postgres stores them =="
psql -c "SELECT tablename, policyname, cmd, regexp_replace(coalesce(qual, ''), '\s+', ' ', 'g') AS using, regexp_replace(coalesce(with_check, ''), '\s+', ' ', 'g') AS with_check FROM pg_policies ORDER BY tablename, cmd"
psql -c "SELECT proname, prosecdef AS security_definer, regexp_replace(prosrc, '\s+', ' ', 'g') AS body FROM pg_proc WHERE proname IN ('rel', 'can_read_member_data') ORDER BY proname"
echo "== proof: what the app role may do at all (RLS only filters inside these grants) =="
psql -c "SELECT table_name, privilege_type, string_agg(column_name, ', ' ORDER BY column_name) AS columns FROM information_schema.column_privileges WHERE grantee = 'app' AND privilege_type <> 'SELECT' AND privilege_type <> 'REFERENCES' GROUP BY 1, 2 ORDER BY 1, 2"
psql -c "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('app', 'postgres') ORDER BY rolname"
echo "== proof: the four bank account requests from step 6 =="
psql -c "SELECT id, member_id, requested_by, field, status, approved_by FROM change_requests WHERE field = 'bank_account' ORDER BY id"
echo "== proof: out/matrix.md (first rows) =="
sed -n '5,16p' out/matrix.md
