#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/35-design-tokens" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/35-design-tokens.log) 2>&1
cd 35-design-tokens
echo "# 35-design-tokens run $(date -u +%FT%TZ)"
echo "== no infra: tokens build with tsx, Storybook builds to static files, Chromium from PLAYWRIGHT_BROWSERS_PATH =="
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
npm install --silent --no-audit --no-fund
npm run --silent typecheck
echo "== demo: tokens -> CSS variables -> components -> contrast gate, axe per story, visual regression =="
status=0
npm run --silent demo || status=$?
echo
echo "== proof: the token files (DTCG), the alias chain for color.text.muted in each layer =="
wc -c tokens/*.tokens.json tokens/proposals/*.json | sed 's/^/  /'
jq -c '.color.gray["600"]' tokens/primitives.tokens.json
jq -c '.color.text.muted' tokens/theme.light.tokens.json
jq -c '.color.text.muted' tokens/theme.dark.tokens.json
jq -c '.color' tokens/proposals/softer-ui.v1.light.tokens.json
echo "== proof: out/tokens.css, the generated custom properties (one line per layer for muted text and the accent) =="
grep -nE -- '^(:root|\[data-theme|@media|  :root)|--color-(gray-600|text-muted|bg-accent):|--space-md:|--text-family:' out/tokens.css
echo "== proof: tokens/contrast.pairs.json, the pairs the gate checks =="
jq -r '.pairs[] | "  \(.fg) (\(.usage)) on \(.on | join(", "))"' tokens/contrast.pairs.json
jq -r '"  decorative, not checked: \(.decorative | join(", "))"' tokens/contrast.pairs.json
echo "== proof: the contrast gate run as CI would, on the committed tokens and on proposal v1 (exit codes) =="
set +e
npx tsx src/tokens/contrast-check.ts --failures-only; echo "  exit $?"
npx tsx src/tokens/contrast-check.ts --failures-only --proposal tokens/proposals/softer-ui.v1.light.tokens.json; echo "  exit $?"
set -e
echo "== proof: the stories in storybook-static/index.json =="
jq -r '.entries[] | select(.type == "story") | "  \(.id)"' storybook-static/index.json
echo "== proof: committed baselines (e2e/__screenshots__) and screenshots =="
ls -l e2e/__screenshots__ | awk 'NR > 1 {print "  " $5, $9}'
ls -l screenshots | awk 'NR > 1 {print "  " $5, $9}'
exit $status
