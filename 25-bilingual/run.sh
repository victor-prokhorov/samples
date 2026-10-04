#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/25-bilingual" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/25-bilingual.log) 2>&1
cd 25-bilingual
echo "# 25-bilingual run $(date -u +%FT%TZ)"
npm install --silent --no-audit --no-fund
echo "== the member page server (node:http on :53035), in the background =="
node --import tsx src/server.ts &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; scrub_paths' EXIT
for _ in $(seq 50); do curl -sf -o /dev/null http://localhost:53035/ && break; sleep 0.2; done
echo "== demo: a client fetching the same page with different Accept-Language headers =="
npm run --silent demo
echo
echo "== proof: catalogue check as CI runs it (npm run check, exit code) =="
npm run --silent check && echo "   exit 0"
echo "== proof: raw response for Accept-Language: fr-CA,fr;q=0.9,en;q=0.8 =="
curl -si -H 'Accept-Language: fr-CA,fr;q=0.9,en;q=0.8' 'http://localhost:53035/?member=bob' | tr -d '\r' | grep -v '^Date:'
echo "== proof: raw pseudo-localised page (/?lang=en-XA), main =="
curl -s 'http://localhost:53035/?lang=en-XA' | sed -n '/<main>/,/<\/main>/p'
echo "== proof: raw naive page in French (/naive?lang=fr), main =="
curl -s 'http://localhost:53035/naive?lang=fr' | sed -n '/<main>/,/<\/main>/p'
echo "== screenshots: the member page in English, French, en-XA and the naive page in French, in Chromium =="
(cd ../tools && npm install --silent --no-audit --no-fund)
rm -f screenshots/*.png
node screenshots/take.mjs
for f in screenshots/*.png; do echo "$f $(wc -c < "$f") bytes"; done
