#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/22-playwright.log) 2>&1
cd 22-playwright
echo "# 22-playwright run $(date -u +%FT%TZ)"
echo "== fresh Postgres and no earlier reports, traces or saved sessions (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
rm -rf test-results reports .auth
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: Vitest for the rule, then @playwright/test runs (each a separate process) against an app server per worker =="
npm run --silent demo
echo
echo "== proof: the saved session every journey reuses (.auth/alice.json, cookie value cut) =="
jq '.cookies |= map(.value = (.value[0:8] + "...")) | .cookies[] | {name, value, domain, path, httpOnly, sameSite}' .auth/alice.json
echo "== proof: per-test results from the JSON reports (status, project, worker, retry) =="
for f in reports/*.json; do
  echo "$f: expected=$(jq .stats.expected "$f") unexpected=$(jq .stats.unexpected "$f")"
  jq -r '.. | objects | select(has("specs")) | .specs[] | .title as $t | .tests[] | .projectName as $p | .results[] | "  \(.status) [\($p)] \($t) worker=\(.workerIndex) retry=\(.retry)"' "$f"
done
echo "== proof: traces kept, only for failed tests (trace: retain-on-failure) =="
find test-results -name trace.zip | sort
trace=test-results/waiting-slow/waiting-total-after-a-fixed-500-ms-sleep-chromium/trace.zip
echo "== proof: what $trace recorded: the actions, then the network calls =="
unzip -p "$trace" test.trace | jq -r 'select(.type == "before" and .method != "hook" and .method != "fixture") | "  step: \(.title)"'
unzip -p "$trace" 0-trace.network | jq -r '"  \(.snapshot.request.method) \(.snapshot.request.url | sub("http://localhost:[0-9]+"; "")) -> \(if .snapshot.response.status == -1 then "no response yet when the test ended" else "\(.snapshot.response.status) in \(.snapshot.time | floor) ms" end)"' | grep -v favicon
echo "== proof: databases. The per-worker clones were dropped when their worker finished =="
psql -c "SELECT datname FROM pg_database WHERE datname NOT IN ('template0', 'template1') ORDER BY datname"
echo "== proof: the template every worker clones (seed data) =="
psql -d portal_template -c "SELECT m.username, e.name AS employer, count(c.*) AS months, sum(c.amount) AS total FROM members m JOIN employers e ON e.id = m.employer_id JOIN contributions c ON c.member_id = m.id GROUP BY 1, 2 ORDER BY 1"
