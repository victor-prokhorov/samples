#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/46-load-test" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/46-load-test.log) 2>&1
cd 46-load-test
echo "# 46-load-test run $(date -u +%FT%TZ)"
K6_VERSION=v2.1.0
if [ "$(.bin/k6 version 2>/dev/null | awk '{print $2}')" != "$K6_VERSION" ]; then
  echo "== k6 $K6_VERSION: release binary from github.com/grafana/k6/releases into .bin/ (not committed) =="
  mkdir -p .bin
  curl -fsSL "https://github.com/grafana/k6/releases/download/$K6_VERSION/k6-$K6_VERSION-linux-amd64.tar.gz" | tar xz -C .bin --strip-components=1 "k6-$K6_VERSION-linux-amd64/k6"
fi
echo "== fresh Postgres with 500,000 members (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: k6 against the member API (a separate process): smoke, SLO gate before and after the fix, ramp, soak =="
npm run --silent demo
echo
echo "== proof: indexes on members after the fix =="
psql -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'members' ORDER BY indexname"
echo "== proof: how often Postgres read the whole members table, against the index (pg_stat_user_tables / pg_stat_user_indexes) =="
psql -c "SELECT relname, seq_scan, seq_tup_read, idx_scan, n_live_tup FROM pg_stat_user_tables WHERE relname = 'members'"
psql -c "SELECT indexrelname, idx_scan, idx_tup_read FROM pg_stat_user_indexes WHERE relname = 'members' ORDER BY indexrelname"
echo "== proof: the k6 summaries the demo read (out/k6/*.json): thresholds per run =="
for f in out/k6/*.json; do
  printf '%-28s ' "$f"
  jq -r '[.metrics | to_entries[] | select(.value.thresholds) | .key as $m | .value.thresholds | to_entries[] | select(.key | endswith(">=0") | not) | "\($m) \(.key) \(if .value.ok then "PASS" else "FAIL" end)"] | if length == 0 then "(no SLO thresholds)" else join("; ") end' "$f"
done
echo "== proof: out/throughput-latency.svg =="
ls -l out/throughput-latency.svg | awk '{print $5, $9}'
echo "== screenshot: screenshots/throughput-latency.png (the SVG rendered by tools/render.mjs) =="
mkdir -p screenshots
npm --prefix ../tools install --silent --no-audit --no-fund
cp out/throughput-latency.svg screenshots/throughput-latency.svg
PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers} node ../tools/render.mjs svg screenshots/throughput-latency.svg
rm screenshots/throughput-latency.svg
ls -l screenshots/throughput-latency.png | awk '{print $5, $9}'
