#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/36-observability.log) 2>&1
cd 36-observability
echo "# 36-observability run $(date -u +%FT%TZ)"
echo "== fresh Postgres, logging every statement with its duration (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
npm --prefix ../tools install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: web :53046 -> api :53146 -> postgres :55466, spans and metrics to an in-process collector =="
npm run --silent demo
echo
echo "== screenshots: the three waterfalls =="
node ../tools/render.mjs html out/trace-before.html screenshots/waterfall-before.png
node ../tools/render.mjs html out/trace-after.html screenshots/waterfall-after.png
node ../tools/render.mjs html out/trace-error.html screenshots/trace-error.png
ls -l screenshots/*.png | awk '{print $5, $9}'
echo "== proof: the slow trace as the collector stored it (first 6 of its spans, trimmed) =="
head -7 out/trace-before.json | cut -c1-260
echo "== proof: spans per trace file, per service and kind =="
for f in out/trace-before.json out/trace-after.json out/trace-error.json; do
  echo "$f: $(jq -r '[.[] | "\(.service) \(.kind)"] | group_by(.) | map("\(length) x \(.[0])") | join(", ")' "$f")"
done
echo "== proof: one trace id in all three logs (web, api, postgres) =="
id=$(jq -r '.[0].traceId' out/trace-before.json)
echo "trace $id"
grep -h "$id" out/logs/web-before.jsonl out/logs/api-before.jsonl | jq -c '{service, level, span_id, msg, duration_ms} | with_entries(select(.value != null))'
echo "postgres: $(docker compose logs --no-log-prefix postgres | grep "traceparent='00-$id-" | grep -c " execute ") statements, first and last:"
docker compose logs --no-log-prefix postgres | grep "traceparent='00-$id-" | grep " execute " | sed -n '1p;$p' | cut -c1-300
echo "== proof: RED per route, before and after (out/red.json) =="
for p in before after; do
  echo "$p (web):"
  jq -r --arg p "$p" '.[$p][] | select(.service == "web") | "  \(.route)  requests \(.requests)  errors \(.errors)  p50 \(.p50)  p95 \(.p95)  within 300 ms \(.withinSlo)/\(.requests)"' out/red.json
done
echo "== proof: what Postgres thinks of the two report queries =="
psql -c "EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF) SELECT coalesce(sum(amount), 0), count(*), max(period) FROM contributions WHERE member_id = 1"
psql -c "EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF) SELECT m.id, coalesce(sum(c.amount), 0), count(c.member_id), max(c.period) FROM members m LEFT JOIN contributions c ON c.member_id = m.id WHERE m.employer_id = 1 GROUP BY m.id ORDER BY m.id"
