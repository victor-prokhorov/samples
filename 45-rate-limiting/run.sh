#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/45-rate-limiting" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/45-rate-limiting.log) 2>&1
cd 45-rate-limiting
echo "# 45-rate-limiting run $(date -u +%FT%TZ)"
echo "== fresh Postgres for the buckets and the member API (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: a member API (a separate process) shared by three employers, flooded by one, without then with limits =="
npm run --silent demo
echo
echo "== proof: the policy (tenants and api_keys) =="
psql -c "SELECT k.key, k.tenant_id AS tenant, k.client, k.rate AS key_rate, k.burst AS key_burst, t.rate AS tenant_rate, t.burst AS tenant_burst FROM api_keys k JOIN tenants t ON t.id = k.tenant_id ORDER BY k.key"
echo "== proof: buckets after the limited run (tokens left, refilled lazily on the next request) =="
psql -c "SELECT key, round(tokens::numeric, 2) AS tokens, to_char(updated_at, 'HH24:MI:SS.MS') AS updated_at FROM buckets ORDER BY key"
echo "== proof: request_log per run and client, as the clients saw it =="
psql -c "SELECT run, client, count(*) AS sent, count(*) FILTER (WHERE status = 200) AS ok, count(*) FILTER (WHERE status = 429) AS limited, round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE status = 200)::numeric) AS p50_ms, round(percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) FILTER (WHERE status = 200)::numeric) AS p95_ms, round(max(ms) FILTER (WHERE status = 200)::numeric) AS max_ms FROM request_log GROUP BY run, client ORDER BY run DESC, client"
echo "== proof: Acme per second with limits (accepted stays near 60/s whatever it sends) =="
psql -c "SELECT at_ms / 1000 AS second, count(*) FILTER (WHERE status = 200) AS accepted, count(*) FILTER (WHERE status = 429) AS refused, count(*) FILTER (WHERE status = 200 AND client = 'acme-sync') AS sync_accepted FROM request_log WHERE run = 'with limits' AND tenant = 'acme' GROUP BY 1 ORDER BY 1"
echo "== proof: out/requests.svg =="
ls -l out/requests.svg | awk '{print $5, $9}'
echo "== screenshot: screenshots/requests.png (the SVG rendered by tools/render.mjs) =="
mkdir -p screenshots
npm --prefix ../tools install --silent --no-audit --no-fund
cp out/requests.svg screenshots/requests.svg
PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers} node ../tools/render.mjs svg screenshots/requests.svg
rm screenshots/requests.svg
ls -l screenshots/requests.png | awk '{print $5, $9}'
