#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/24-characterization" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/24-characterization.log) 2>&1
cd 24-characterization
echo "# 24-characterization run $(date -u +%FT%TZ)"
echo "== fresh Postgres with the legacy function (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: golden master of legacy_monthly_contribution(), the TS rewrite checked against it =="
npm run --silent demo
echo
echo "== proof: the approval file (committed; head) =="
head -4 approved/legacy.approved.tsv
wc -l < approved/legacy.approved.tsv | sed 's/^/   lines: /'
echo "== proof: every case's verdict for the final rewrite =="
psql -c "SELECT verdict, kind, count(*) FROM cases GROUP BY verdict, kind ORDER BY verdict, kind"
echo "== proof: why the booklet rewrite differed, per case (the smallest set of rules that reproduces legacy) =="
psql -c "SELECT coalesce(explained_by, '(no mismatch)') AS explained_by, count(*) FROM cases GROUP BY 1 ORDER BY count(*) DESC"
echo "== proof: the leap-year bug in the golden master: legacy age (days / 365) vs calendar age, allowlisted cases at the default salary =="
psql -c "SELECT (period - birth_date) / 365 AS legacy_age, extract(year FROM age(period, birth_date)) AS real_age, count(*),
  min((birth_date + make_interval(years => extract(year FROM age(period, birth_date))::int + 1))::date - period) AS min_days_to_birthday,
  max((birth_date + make_interval(years => extract(year FROM age(period, birth_date))::int + 1))::date - period) AS max_days_to_birthday,
  min(legacy) AS legacy, min(rewrite) AS rewrite
  FROM cases WHERE verdict LIKE 'allowlisted%' AND salary = 48000 GROUP BY 1, 2 ORDER BY 1"
echo "== proof: the rates hidden in the legacy outputs, by calendar age (implied rate = legacy x 12 / pensionable, truncation shaves the last digit) =="
psql -c "SELECT CASE WHEN extract(year FROM age(period, birth_date)) < 35 THEN 'under 35' WHEN extract(year FROM age(period, birth_date)) < 50 THEN '35 to 49' ELSE '50 and over' END AS calendar_age,
  round(legacy * 12 / (least(salary, 150000) - 6000), 2) AS implied_rate, count(*)
  FROM cases WHERE legacy > 0 GROUP BY 1, 2 ORDER BY min(extract(year FROM age(period, birth_date))), 2"
