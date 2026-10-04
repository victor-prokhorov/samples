#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/44-http-caching.log) 2>&1
cd 44-http-caching
echo "# 44-http-caching run $(date -u +%FT%TZ)"
echo "== fresh Postgres for members, fund prices, help pages and the invalidation outbox (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: the origin (:53054) and the shared cache (:53154) as separate processes, a load generator, Chromium for the browser cache and the leak =="
status=0
npm run --silent demo || status=$?
echo
echo "== proof: the raw headers, origin then cache (curl -sI) =="
# node directly (not npm run), so the pid killed below is the server itself
tmp=$(mktemp -d)
node --import tsx src/origin.ts > "$tmp/origin.log" 2>&1 &
origin=$!
node --import tsx src/cache.ts > "$tmp/cache.log" 2>&1 &
cache=$!
trap 'kill $origin $cache 2>/dev/null || true' EXIT
for i in $(seq 1 100); do curl -sf -o /dev/null http://localhost:53154/api/funds && break; sleep 0.1; done
echo "-- GET /api/funds from the origin"
curl -sI http://localhost:53054/api/funds | grep -iE '^(HTTP|cache-control|etag|cache-tag)'
echo "-- GET /api/funds through the cache, twice (the second is a HIT with an Age; Cache-Tag is not passed on)"
curl -sI http://localhost:53154/api/funds | grep -iE '^(HTTP|cache-control|etag|cache-tag|age|x-cache)'
sleep 1
curl -sI http://localhost:53154/api/funds | grep -iE '^(HTTP|cache-control|etag|cache-tag|age|x-cache)'
echo "-- GET /members/me through the cache as member 1, with the ETag it got: 304, still PASS (never stored)"
etag=$(curl -s -D - -o /dev/null -H 'cookie: session=session-1' http://localhost:53154/members/me | awk 'tolower($1)=="etag:"{print $2}' | tr -d '\r')
curl -sI -H 'cookie: session=session-1' -H "if-none-match: $etag" http://localhost:53154/members/me | grep -iE '^(HTTP|cache-control|etag|x-cache)'
echo "-- GET /help/contributions through the cache in French"
curl -sI -H 'accept-language: fr-FR,fr;q=0.9' http://localhost:53154/help/contributions | grep -iE '^(HTTP|cache-control|vary|content-language|x-cache)'
kill $origin $cache 2>/dev/null || true
wait $origin $cache 2>/dev/null || true
echo "== proof: the invalidation outbox (one row per change, written by the trigger in the same transaction) =="
psql -c "SELECT id, tag, reason, created_at::time(3) AS at FROM cache_invalidations ORDER BY id"
psql -c "SELECT name, version FROM data_versions"
echo "== proof: the trigger that writes it =="
psql -c "SELECT tgname, tgrelid::regclass AS on_table, pg_get_triggerdef(oid) LIKE '%FOR EACH STATEMENT%' AS per_statement FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname"
echo "== proof: screenshots =="
ls -l screenshots/*.png | awk '{print $5, $9}'
exit $status
