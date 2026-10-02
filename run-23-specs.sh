#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/23-specs.log) 2>&1
cd 23-specs
echo "# 23-specs run $(date -u +%FT%TZ)"
echo "== fresh Postgres (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
rm -rf reports
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: features/change-bank-details.feature run by cucumber-js against two implementations =="
npm run --silent demo
echo
echo "== proof: the traceability matrix in Postgres, naive vs domain, per requirement =="
psql -c "SELECT requirement,
  count(*) FILTER (WHERE implementation = 'domain') AS scenarios,
  count(*) FILTER (WHERE implementation = 'naive' AND status = 'passed') AS naive_passed,
  count(*) FILTER (WHERE implementation = 'domain' AND status = 'passed') AS domain_passed
  FROM spec_results GROUP BY requirement ORDER BY requirement"
echo "== proof: the scenarios the naive implementation failed =="
psql -c "SELECT requirement, scenario FROM spec_results WHERE implementation = 'naive' AND status <> 'passed' ORDER BY requirement, scenario"
echo "== proof: raw Cucumber messages, one per line (the input of the traceability report) =="
node -e '
const lines = require("fs").readFileSync("reports/domain.ndjson", "utf8").trim().split("\n").map(JSON.parse);
const kinds = {};
for (const l of lines) for (const k of Object.keys(l)) kinds[k] = (kinds[k] ?? 0) + 1;
console.log("   envelopes by type:", JSON.stringify(kinds));
const outline = lines.find((l) => l.pickle && l.pickle.astNodeIds.length === 2).pickle;
console.log("   one outline example as a pickle (scenario id + example row id, tags inherited from the Rule):");
console.log("  ", JSON.stringify({ name: outline.name, astNodeIds: outline.astNodeIds, tags: outline.tags.map((t) => t.name), steps: outline.steps.map((s) => s.text) }));
console.log("  ", JSON.stringify(lines.find((l) => l.testRunFinished)));
'
