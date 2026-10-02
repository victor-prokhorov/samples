#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/27-import.log) 2>&1
cd 27-import
echo "# 27-import run $(date -u +%FT%TZ)"
echo "== fresh Postgres (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: monthly files from employers in data/, a naive import then a staged one =="
npm run --silent demo
echo
echo "== proof: import_batches. One applied batch per file hash; refused files are recorded with the reason. Ids have gaps: a rolled-back or skipped INSERT still uses a sequence value =="
psql -c "SELECT id, file_name, left(sha256, 12) AS sha256, status, rows_declared AS declared, rows_received AS received, accepted, rejected, inserted, updated, unchanged, missing, amount_declared, amount_accepted, amount_rejected, amount_net FROM import_batches ORDER BY id"
psql -c "SELECT id, reason FROM import_batches WHERE status = 'refused' ORDER BY id"
echo "== proof: import_rejects. One row per broken rule, with the raw line; refused batches keep theirs =="
psql -c "SELECT batch_id, line_no, rule, detail, raw FROM import_rejects ORDER BY batch_id, line_no, rule"
echo "== proof: members. M0001 updated and M0007 inserted by batch 4, M0004 (missing from September) kept, M0005 kept its August row =="
psql -c "SELECT employer, member_no, first_name, last_name, email, birth_date, last_batch_id FROM members ORDER BY employer, member_no"
echo "== proof: contributions per month. No duplicates: the primary key is the natural key =="
psql -c "SELECT employer, period, count(*) AS rows, sum(amount) AS total, string_agg(member_no || '=' || amount || ' (b' || last_batch_id || ')', ', ' ORDER BY member_no) AS detail FROM contributions GROUP BY employer, period ORDER BY period"
echo "== proof: naive_contributions after the half-applied run and the resend =="
psql -c "SELECT member_no, period, count(*) AS copies, sum(amount) AS total FROM naive_contributions GROUP BY member_no, period ORDER BY member_no"
