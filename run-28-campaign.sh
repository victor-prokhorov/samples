#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/28-campaign.log) 2>&1
cd 28-campaign
echo "# 28-campaign run $(date -u +%FT%TZ)"
echo "== fresh Postgres (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
rm -rf out
npm run --silent setup
echo "== demo: the SMTP sink runs in the demo process; naive loop and workers are child processes =="
npm run --silent demo
echo
echo "== proof: statement_jobs. One row per (year, member); M0003's address was corrected and requeued; M0004 is the dead letter =="
psql -c "SELECT m.member_no, m.email, j.status, j.attempts, j.message_id, left(j.pdf_sha256, 12) AS pdf_sha256, j.last_error FROM statement_jobs j JOIN members m ON m.id = j.member_id ORDER BY m.member_no"
echo "== proof: statement_attempts. Every SMTP attempt, by worker; the in_doubt row is written by worker B when it took M0007 over from A, whose lease had expired =="
psql -c "SELECT a.id, m.member_no, a.attempt, a.worker, a.outcome, a.detail FROM statement_attempts a JOIN members m ON m.id = a.member_id ORDER BY m.member_no, a.id"
echo "== proof: the dry-run sample PDFs in out/ (same sha256 as the PDF later sent to the same member, as long as the data did not change) =="
for f in out/*.pdf; do echo "$f $(wc -c < "$f") bytes, starts with $(head -c 8 "$f"), sha256 $(sha256sum "$f" | cut -c1-12)"; done
