#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/40-feature-flags" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/40-feature-flags.log) 2>&1
cd 40-feature-flags
echo "# 40-feature-flags run $(date -u +%FT%TZ)"
echo "== fresh Postgres for flags and flag_audit (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: a statement API (a separate process) evaluates flags from a cached copy; the demo flips them =="
npm run --silent demo
echo
echo "== proof: flags, the state after the run (version counts the updates) =="
psql -c "SELECT key, kind, enabled, percentage, tenants, expires_on, version FROM flags ORDER BY key"
echo "== proof: flag_audit, one row per change, written by the trigger with the actor and reason the transaction set =="
psql -c "SELECT id, to_char(at, 'HH24:MI:SS.MS') AS at, flag_key, action, actor, reason, before->>'enabled' AS was_on, after->>'enabled' AS is_on, before->>'percentage' AS was_pct, after->>'percentage' AS pct, after->'tenants' AS tenants FROM flag_audit ORDER BY id"
echo "== proof: exposures. Members on at each step, and members on at the previous step but off now (the stable hash never takes the feature away) =="
psql -c "SELECT percentage, count(*) FILTER (WHERE stable) AS stable_on, count(*) FILTER (WHERE prev_stable AND NOT stable) AS stable_lost, count(*) FILTER (WHERE naive) AS naive_on, count(*) FILTER (WHERE prev_naive AND NOT naive) AS naive_lost FROM (SELECT percentage, stable, naive, lag(stable) OVER w AS prev_stable, lag(naive) OVER w AS prev_naive FROM exposures WINDOW w AS (PARTITION BY member_id ORDER BY percentage)) x GROUP BY percentage ORDER BY percentage"
echo "== proof: exposure by tenant at 10% (the hash ignores the tenant, so every employer gets about the same share) =="
psql -c "SELECT tenant, count(*) AS members, count(*) FILTER (WHERE stable) AS on_at_10pct, round(100.0 * count(*) FILTER (WHERE stable) / count(*), 1) AS pct FROM exposures WHERE percentage = 10 GROUP BY tenant ORDER BY tenant"
echo "== proof: CI check on the service's own code (npm run lint:flags) =="
npm run --silent lint:flags
echo "== proof: out/exposure.svg =="
ls -l out/exposure.svg | awk '{print $5, $9}'
echo "== screenshot: screenshots/exposure.png (the SVG rendered by tools/render.mjs) =="
mkdir -p screenshots
npm --prefix ../tools install --silent --no-audit --no-fund
cp out/exposure.svg screenshots/exposure.svg
PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers} node ../tools/render.mjs svg screenshots/exposure.svg
rm screenshots/exposure.svg
ls -l screenshots/exposure.png | awk '{print $5, $9}'
