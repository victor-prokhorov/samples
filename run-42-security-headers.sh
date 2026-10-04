#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/42-security-headers.log) 2>&1
cd 42-security-headers
echo "# 42-security-headers run $(date -u +%FT%TZ)"
echo "== no database needed: two portal builds and an attacker site, all in the demo process =="
echo "   insecure :53052, hardened :53152, attacker :53252 (also reached as 127.0.0.1:53252, another site)"
rm -rf out screenshots
npm install --silent --no-audit --no-fund
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"

echo "== secrets: the signing key comes from the environment (here a fresh random one); a developer's .env.local holds a token =="
SESSION_KEYS="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
export SESSION_KEYS
token="npm_$(node -e 'console.log(require("crypto").randomBytes(64).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 36))')"
printf 'SESSION_KEYS=%s\nNPM_TOKEN=%s\n' "$SESSION_KEYS" "$token" > .env.local
trap 'rm -f .env.local' EXIT
echo "wrote .env.local (gitignored): SESSION_KEYS=<32 random bytes> NPM_TOKEN=npm_<36 random chars>"
SCANNER=ghcr.io/gitleaks/gitleaks:v8.30.1
if docker image inspect "$SCANNER" >/dev/null 2>&1 || docker pull -q "$SCANNER" >/dev/null 2>&1; then
  export SECRET_SCANNER_IMAGE=$SCANNER
  echo "secret scanner: $SCANNER"
else
  export SECRET_SCANNER_NOTE="gitleaks could not be pulled from ghcr.io; secret scan skipped"
  echo "secret scanner: none ($SECRET_SCANNER_NOTE)"
fi

echo "== demo: header scan, then XSS, CSRF and framing against both builds in Chromium (Playwright) =="
npm run --silent demo
echo
for build in insecure hardened; do
  echo "== proof: raw response headers of the signed-in account page, $build build (nonce and cookie value cut) =="
  npx tsx src/dump-headers.ts "$build"
done
echo "== proof: out/csp-reports.json (what the browser sent to POST /csp-report) =="
jq -c '.[]' out/csp-reports.json
echo "== proof: screenshots =="
ls -l screenshots/*.png | awk '{print $5, $9}'
