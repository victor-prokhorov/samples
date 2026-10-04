#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/21-accessibility" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/21-accessibility.log) 2>&1
cd 21-accessibility
echo "# 21-accessibility run $(date -u +%FT%TZ)"
echo "== fresh state: no database; remove earlier scan results =="
rm -rf out
npm install --silent --no-audit --no-fund
echo "== demo: Chromium (Playwright) drives the same form in two versions, served by react-dom/server from a separate node:http process =="
npm run --silent demo
echo
echo "== proof: axe violations per scan (rule, impact, WCAG tags, failing nodes), raw from out/axe-*.json =="
for f in out/axe-*.json; do
  echo "$f: $(jq '.violations | length' "$f") violations, $(jq '.passes | length' "$f") rules passed"
  jq -r '.violations[] | "  \(.id) \(.impact) [\(.tags | map(select(test("^wcag[0-9]{3,}$"))) | join(","))] nodes=\(.nodes | length): \(.nodes | map(.target[0]) | join(" "))"' "$f"
done
html() { perl -0pe 's/<style>.*?<\/style>//s; s/></>\n</g' "$1" | grep -v '^\s*$'; }
echo "== proof: the inaccessible form after a failed submit (out/bad-errors.html): placeholders, a red class, a div for a button =="
html out/bad-errors.html
echo "== proof: the accessible form after a failed submit (out/good-errors.html): summary, labels, aria-describedby, aria-invalid, autocomplete =="
html out/good-errors.html
echo "== screenshots: both forms after a failed submit (out/*-errors.html) and the axe results (out/axe-*.json), in Chromium =="
(cd ../tools && npm install --silent --no-audit --no-fund)
rm -f screenshots/*.png
node screenshots/take.mjs
for f in screenshots/*.png; do echo "$f $(wc -c < "$f") bytes"; done
