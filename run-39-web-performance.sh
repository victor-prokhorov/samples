#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/39-web-performance.log) 2>&1
cd 39-web-performance
echo "# 39-web-performance run $(date -u +%FT%TZ)"
echo "== no infra: the member page (node:http :53049) and the RUM collector (:53149) run inside the demo; Lighthouse and the visits use the Chromium in PLAYWRIGHT_BROWSERS_PATH =="
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
rm -rf dist
npm install --silent --no-audit --no-fund
npm run --silent typecheck
echo "== demo: build, bundle budget, Lighthouse (lab), web-vitals beacons (field, p75), one budget report =="
status=0
npm run --silent demo || status=$?
echo
echo "== proof: budgets.json =="
jq -c '{lab, field, bundle}' budgets.json
echo "== proof: what each page loads (dist/, the build output the server serves) =="
ls -l dist/slow dist/fast dist/img | awk '/^dist/ {print; next} NR > 1 && $5 {print "  " $5, $9}'
echo "== proof: the head of each page: render-blocking in slow, inline CSS + preload + module in fast =="
npx tsx -e 'import("./src/pages.ts").then(({ slowPage, fastPage }) => { for (const [n, h] of [["slow", slowPage()], ["fast", fastPage()]]) { console.log("-- " + n); for (const l of h.split("\n").filter((l) => /<(script|link|img|picture|source)/.test(l))) console.log("  " + l.replace(/<style>.*<\/style>/, "<style>(inline CSS)</style>").slice(0, 220)); } })'
echo "== proof: out/lab-summary.json (Lighthouse, one run per page) =="
jq -r '.[] | "  \(.page): Lighthouse \(.version), score \(.score), LCP \(.lcp) ms, FCP \(.fcp) ms, CLS \(.cls), TBT \(.tbt) ms, script \(.scriptBytes) B, image \(.imageBytes) B, \(.requests) requests"' out/lab-summary.json
echo "== proof: out/vitals.ndjson, the beacons as stored (first 6 of $(wc -l < out/vitals.ndjson)) =="
head -6 out/vitals.ndjson | sed 's/^/  /'
echo "== proof: the same file recomputed with jq: p75 (nearest rank) of LCP and INP per page and profile =="
jq -s -r 'group_by(.page, .name, .profile)[] | select(.[0].name == "LCP" or .[0].name == "INP") | (map(.value) | sort) as $v | "  \(.[0].page) \(.[0].name) \(.[0].profile): n=\($v | length) values=\($v | map(round) | tostring) p75=\($v[(($v | length) * 0.75 | ceil) - 1] | round)"' out/vitals.ndjson
echo "== proof: out/field-summary.json (GET /summary) =="
jq -c '.' out/field-summary.json
echo "== proof: committed reports and screenshots =="
ls -l out screenshots | awk '/:$/ {print; next} NR > 1 && $5 {print "  " $5, $9}'
exit $status
