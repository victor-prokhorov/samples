#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/29-kpis.log) 2>&1
cd 29-kpis
echo "# 29-kpis run $(date -u +%FT%TZ)"
echo "== fresh Postgres for events and request_log (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: the portal (a separate process) emits events, a simulator drives 28 days of traffic, SQL computes the KPIs =="
npm run --silent demo
echo
echo "== proof: events, the usage stream the product KPIs read =="
psql -c "SELECT name, count(*) AS events, count(DISTINCT member_id) AS members, count(DISTINCT session_id) AS sessions, min(at)::date AS first, max(at)::date AS last FROM events GROUP BY name ORDER BY events DESC"
echo "== proof: request_log, one row per HTTP request, the stream the service KPIs read =="
psql -c "SELECT method, route, status, count(*) AS requests, round(avg(duration_ms)) AS mean_ms, round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric) AS p95_ms FROM request_log WHERE at < '2026-10-01' GROUP BY method, route, status ORDER BY route, status"
echo "== proof: the incident hour by hour (only member requests fail; /health keeps answering 200) =="
psql -c "SELECT date_trunc('hour', at) AS hour, count(*) FILTER (WHERE route = '/health') AS probes, count(*) FILTER (WHERE route = '/health' AND status = 200) AS probes_ok, count(*) FILTER (WHERE route <> '/health') AS member_requests, count(*) FILTER (WHERE status >= 500) AS failed FROM request_log WHERE at >= '2026-09-17 08:00Z' AND at < '2026-09-17 14:00Z' GROUP BY 1 ORDER BY 1"
echo "== proof: change_requests against the 3-day SLA =="
psql -c "SELECT status, count(*) AS requests, count(*) FILTER (WHERE resolved_at <= submitted_at + interval '3 days') AS within_sla, count(*) FILTER (WHERE resolved_at > submitted_at + interval '3 days') AS late, round(avg(extract(epoch FROM resolved_at - submitted_at) / 3600)) AS avg_hours FROM change_requests GROUP BY status"
echo "== proof: out/dashboard.html (static, no script) =="
ls -l out/dashboard.html | awk '{print $5, $9}'
paste -d' ' <(grep -o 'class="name">[^<]*' out/dashboard.html | cut -d'>' -f2) <(grep -o '</span> [^<]*' out/dashboard.html | cut -c9- | sed 's/&lt;/</; s/&gt;/>/')
