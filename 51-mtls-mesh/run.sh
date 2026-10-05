#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/51-mtls-mesh" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/51-mtls-mesh.log) 2>&1
cd 51-mtls-mesh
echo "# 51-mtls-mesh run $(date -u +%FT%TZ)"
echo "== deps on the host; the app containers mount this folder and run the same node_modules =="
npm install --silent --no-audit --no-fund
echo "== a fresh private CA and workload certificates in certs/ (gitignored; the sidecars mount them) =="
rm -rf certs
npm run --silent certs
echo "== fresh mesh: orders and payments apps, an Envoy sidecar in each one's network namespace, a tap between (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
echo "sidecars: Envoy $(docker compose exec -T orders-sidecar envoy --version | grep -oE '/[0-9]+\.[0-9]+\.[0-9]+/' | tr -d /)"
echo "== demo: the same Charge call in plaintext, with server TLS, with mTLS in the app, then through the sidecars =="
npm run --silent demo
echo
echo "== proof: orders' certificate (openssl x509): its identity is the URI SAN, valid for one day =="
openssl x509 -in certs/orders.crt -noout -subject -issuer -dates -ext subjectAltName,extendedKeyUsage | sed 's/^/   /'
echo "== proof: openssl verify against the mesh CA (the rogue and expired certificates fail) =="
for c in orders payments reports rogue-orders expired-orders; do
  printf '   %-15s ' "$c"; { openssl verify -CAfile certs/ca.crt "certs/$c.crt" 2>&1 || true; } | grep -E ': OK$|^error [0-9]+ at' | sed 's#^certs/##'
done
echo "== proof: the containers; each sidecar shares its app's network namespace (network_mode: service:...) =="
docker compose ps --format 'table {{.Name}}\t{{.State}}\t{{.Ports}}'
for s in orders-sidecar payments-sidecar; do
  printf '   %-17s network mode: %s\n' "$s" "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$(docker compose ps -q "$s")" | sed -E 's/container:([0-9a-f]{12}).*/container:\1.../')"
done
echo "== proof: the sidecars' TLS and RBAC counters (Envoy admin /stats, read through the orders app) =="
curl -s localhost:53061/stats | jq -r '.orders, .payments | to_entries[] | select(.key | test("ssl\\.(handshake|fail_verify_no_cert|fail_verify_error|fail_verify_san|versions)|rbac\\.(allowed|denied)$")) | select(.key | test("listener.admin|worker_") | not) | "   \(.key) = \(.value)"'
echo "== proof: what the tap between the sidecars holds (bytes, connections, whether the card number appears) =="
curl -s localhost:53261/stats | jq -c '{bytes, connections, sawCard, words: [.strings[] | select(test("[a-z]{6,}"))]}' | sed 's/^/   /'
echo "== proof: out/certs.txt and out/results.svg =="
ls -l out/certs.txt out/results.svg | awk '{print "   " $5, $9}'
echo "== screenshot: screenshots/results.png (out/results.svg rendered by tools/render.mjs) =="
mkdir -p screenshots
npm --prefix ../tools install --silent --no-audit --no-fund
cp out/results.svg screenshots/results.svg
PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers} node ../tools/render.mjs svg screenshots/results.svg
rm screenshots/results.svg
ls -l screenshots/results.png | awk '{print $5, $9}'
