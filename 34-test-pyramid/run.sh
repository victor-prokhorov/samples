#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/34-test-pyramid" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/34-test-pyramid.log) 2>&1
cd 34-test-pyramid
echo "# 34-test-pyramid run $(date -u +%FT%TZ)"
echo "== fresh Postgres, no earlier reports or coverage (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
rm -rf .tmp test-results out/coverage
npm install --silent --no-audit --no-fund
(cd ../tools && npm install --silent --no-audit --no-fund)
export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
echo "== typecheck, database, browser bundle =="
npm run --silent typecheck && echo "tsc: no errors"
npm run --silent setup
npm run --silent build && echo "esbuild: public/app.js $(wc -c < public/app.js) bytes"
echo "== demo: each level of the pyramid on its own, the flaky and the robust wait, the coverage gate =="
npm run --silent demo
echo
echo "== proof: the measured levels (out/levels.json, drawn as out/pyramid.svg and the overview diagram) =="
jq -r '.[] | "\(.label): \(.passed)/\(.tests) passed, wall \(.wallMs) ms, tests themselves \(.testMs) ms"' out/levels.json
node diagrams/build.mjs && echo "diagrams/overview.svg rebuilt from out/levels.json"
echo "== proof: the app database after the browser runs (each test truncates first, so this is the last robust run, M0002) =="
psql -d pyramid -c "SELECT c.member_id, m.name, c.rate, c.effective_from, c.status FROM contribution_changes c JOIN members m ON m.id = c.member_id"
echo "== proof: the API tests' database, and the two constraints that hold the rules =="
psql -d pyramid_api_test -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'contribution_changes'::regclass AND contype = 'c'"
psql -d pyramid_api_test -c "SELECT indexdef FROM pg_indexes WHERE indexname = 'one_pending_change'"
echo "== proof: the flaky runs, per attempt, from Playwright's JSON report =="
for f in flaky robust; do
  jq -r --arg f "$f" '[.. | objects | select(has("results")) | .results[] | "\(.status) \(.duration)ms"] | "\($f): " + join(", ")' .tmp/$f.json
done
echo "== proof: coverage totals (out/coverage/coverage-summary.json) =="
jq -r '.total | to_entries[] | select(.key != "branchesTrue") | "\(.key): \(.value.covered)/\(.value.total) = \(.value.pct)%"' out/coverage/coverage-summary.json
echo "== screenshots: the coverage report and the form after the end-to-end journey =="
node ../tools/render.mjs html out/coverage/index.html screenshots/coverage-report.png 1100
ls -l screenshots/*.png | awk '{print $5, $9}'
