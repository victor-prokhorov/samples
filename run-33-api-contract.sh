#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/33-api-contract.log) 2>&1
cd 33-api-contract
echo "# 33-api-contract run $(date -u +%FT%TZ)"
echo "== no infra: the provider is node:http with in-memory data; fresh install, no earlier temp files =="
rm -rf .tmp
npm install --silent --no-audit --no-fund
(cd ../tools && npm install --silent --no-audit --no-fund)
echo "== typecheck: the consumer compiles against the client generated from openapi/v2.yaml =="
npm run --silent typecheck && echo "tsc: no errors"
echo "== demo: spec, runtime validation, typed client, drift caught by the contract test, breaking-change check, reference page =="
npm run --silent demo
echo
PORT=53043 npm run --silent server > .tmp/server.log 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
for _ in $(seq 50); do curl -s -o /dev/null localhost:53043/openapi.yaml && break; sleep 0.1; done
echo "== proof: the deprecated endpoint, raw (curl -i; RFC 9745 Deprecation, RFC 8594 Sunset, Link to the successor) =="
curl -s -i -H 'authorization: Bearer acme-demo-token' localhost:53043/members/M0001/contributions | tr -d '\r' | sed -n '1,8p'
echo "== proof: its successor, first page of 3 =="
curl -s -H 'authorization: Bearer acme-demo-token' 'localhost:53043/contributions?memberId=M0001&limit=3' | jq -c .
echo "== proof: a request that does not match the spec, raw (RFC 9457 problem, every mismatch listed) =="
curl -s -o .tmp/problem.json -w 'status %{http_code}, content-type %{content_type}\n' -H 'authorization: Bearer acme-demo-token' -H 'content-type: application/json' \
  -d '{"kind":"phone","value":"","effectiveDate":"2026-02-30","urgent":true}' localhost:53043/members/M0002/change-requests
jq . .tmp/problem.json
echo "== proof: the breaking-change check as CI runs it (exit code is the gate) =="
set +e
npx tsx src/breaking.ts openapi/v1.yaml openapi/v2.yaml > /dev/null; echo "v1 -> v2:          exit $?"
npx tsx src/breaking.ts openapi/v1.yaml openapi/v2-breaking.yaml > /dev/null; echo "v1 -> v2-breaking: exit $?"
set -e
echo "== proof: the generated client marks the deprecated operation (editors strike it through) =="
grep -n -B1 -A3 '@deprecated' src/generated/api.d.ts | head -8
echo "== proof: out/api-reference.html loads nothing from the network =="
ls -l out/api-reference.html | awk '{print $5, $9}'
echo "script tags with src: $(grep -o '<script[^>]*src=' out/api-reference.html | wc -l), stylesheet links: $(grep -o '<link[^>]*stylesheet' out/api-reference.html | wc -l)"
echo "== screenshots: the reference page, opened from the file with the network blocked =="
PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers} node src/screenshot.mjs
ls -l screenshots/*.png | awk '{print $5, $9}'
