#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/50-dns-discovery" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/50-dns-discovery.log) 2>&1
cd 50-dns-discovery
echo "# 50-dns-discovery run $(date -u +%FT%TZ)"
echo "== deps on the host; the containers mount this folder and run the same node_modules =="
npm install --silent --no-audit --no-fund
echo "== fresh network: 3 catalog replicas, ledger-a, ledger-b, CoreDNS and the probe (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
echo "== demo: four clients find catalog by name; scale out, stop one, pause one; then SRV records =="
npm run --silent demo
echo
echo "== proof: the containers now (the catalog replica stopped in step 4 and the two ledgers stopped in step 6 are not listed; the paused one was unpaused) =="
docker compose ps --format 'table {{.Name}}\t{{.Service}}\t{{.State}}'
echo "== proof: what a container is told to use for DNS (Docker's embedded resolver) =="
docker compose exec -T probe grep -v '^#' /etc/resolv.conf | grep -v '^$'
echo "== proof: getent hosts catalog in the probe (glibc's view: one line per live replica) =="
docker compose exec -T probe getent ahostsv4 catalog | awk '$2 == "STREAM" {print $1}' | sort -V
echo "== proof: the SRV zone CoreDNS serves (dns/svc.internal.zone) =="
grep -E 'SRV' dns/svc.internal.zone | grep -v '^;'
echo "== proof: CoreDNS's query log, the last SRV lookups =="
docker compose logs --no-log-prefix coredns 2>/dev/null | grep -E '"SRV IN _http' | tail -3 | sed -E 's/^\[INFO\] [0-9.:]+ - [0-9]+ //'
echo "== screenshot: screenshots/requests.png (out/requests.svg rendered by tools/render.mjs) =="
mkdir -p screenshots
npm --prefix ../tools install --silent --no-audit --no-fund
cp out/requests.svg screenshots/requests.svg
PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers} node ../tools/render.mjs svg screenshots/requests.svg
rm screenshots/requests.svg
ls -l screenshots/requests.png | awk '{print $5, $9}'
