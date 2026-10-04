#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
scrub_paths() { node "$ROOT/tools/scrub-paths.mjs" "$ROOT" "$ROOT/07-file-upload" 2>/dev/null || true; }
trap scrub_paths EXIT
mkdir -p logs
exec > >(sed -u "s#$ROOT#<repo>#g" | tee logs/07-file-upload.log) 2>&1
cd 07-file-upload
echo "# 07-file-upload run $(date -u +%FT%TZ)"
echo "== fresh Postgres for the files API (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: a client (this process) against the Express files API, a separate process it starts and stops =="
npm run --silent demo
echo
echo "== proof: files. version is the ETag; each create is one row despite retries and a concurrent duplicate =="
psql -c "SELECT left(id::text, 8) AS id, name, status, size, version, left(sha256, 12) AS sha256, changed_xid FROM files ORDER BY changed_xid, id"
echo "== proof: one stored response per (owner, key), written in the same transaction as the file =="
psql -c "SELECT left(key::text, 8) AS key, response_status, response_headers->>'ETag' AS etag, left(response_body->>'fileId', 8) AS file_id FROM idempotency_keys ORDER BY created_at"
