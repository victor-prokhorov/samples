#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/48-object-storage" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/48-object-storage.log) 2>&1
cd 48-object-storage
echo "# 48-object-storage run $(date -u +%FT%TZ)"
echo "== fresh Postgres for upload metadata (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: storage (s3rver behind a SigV4 gate, :53158), the member app (:53058) and the scanner as separate processes; Chromium drives the page =="
status=0
npm run --silent demo || status=$?
echo
echo "== proof: uploads, the app's metadata and state machine (the bytes are not in Postgres) =="
psql -c "SELECT left(id::text, 8) AS id, filename, content_type, size, status, verdict, key FROM uploads ORDER BY created_at"
echo "== proof: what s3rver wrote to disk, by prefix (quarantine/ is empty: every object was promoted or rejected) =="
data="$(node -p 'require("os").tmpdir()')/48-object-storage-data/member-documents"
find "$data" -name '*._S3rver_object' -printf '%s %P\n' | sed 's/\._S3rver_object$//' | sort -k2 | awk '{printf "  %10d  %s\n", $1, $2}'
echo "== proof: the object metadata s3rver keeps for the browser's PDF (content type as signed, ETag = MD5) =="
key=$(psql -tA -c "SELECT key FROM uploads WHERE filename LIKE 'Relev%'")
echo "$key: $(jq -c . "$data/$key._S3rver_metadata.json"), md5 $(cat "$data/$key._S3rver_object.md5")"
echo "== proof: screenshots/upload-page.png =="
ls -l screenshots/upload-page.png | awk '{print $5, $9}'
exit $status
