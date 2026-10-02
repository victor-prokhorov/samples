#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/18-crypto-shredding.log) 2>&1
cd 18-crypto-shredding
echo "# 18-crypto-shredding run $(date -u +%FT%TZ)"
echo "== fresh Postgres with databases events, keys, kms (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
sh_pg() { docker compose exec -T postgres sh -c "$1"; }
npm run --silent setup
echo "== demo: two customers, PII encrypted under per-subject keys =="
npm run --silent demo
echo
echo "== proof: what the events table actually holds (PII is ciphertext, order and amount in clear) =="
psql -d events -c "SELECT id, left(subject_id::text, 8) AS subject, type, data, left(pii::text, 56) AS pii FROM events ORDER BY id"
echo "== proof: the key store holds only wrapped DEKs and HMACs, never a plaintext key or email =="
psql -d keys -c "SELECT left(subject_id::text, 8) AS subject, left(wrapped_dek, 24) AS wrapped_dek, kek_id FROM subject_keys ORDER BY created_at"
psql -d keys -c "SELECT left(encode(email_hash, 'hex'), 16) AS email_hash, left(subject_id::text, 8) AS subject FROM subject_lookup"
psql -d events -c "SELECT count(*) AS events, md5(string_agg(pii::text, ',' ORDER BY id)) AS pii_fingerprint FROM events"
echo "== KEK rotation: rewrap the DEKs, leave the data alone =="
npm run --silent rotate
psql -d keys -c "SELECT left(subject_id::text, 8) AS subject, left(wrapped_dek, 24) AS wrapped_dek, kek_id FROM subject_keys ORDER BY created_at"
echo "== proof: same events, same fingerprint (the append-only trigger would have rejected any UPDATE anyway) =="
psql -d events -c "SELECT count(*) AS events, md5(string_agg(pii::text, ',' ORDER BY id)) AS pii_fingerprint FROM events"
echo "== nightly backups: pg_dump of events (fine) and of keys (the mistake this run will show) =="
sh_pg "pg_dump -U postgres events > /tmp/events-backup.sql && pg_dump -U postgres keys > /tmp/keys-backup.sql && ls -l /tmp/*-backup.sql"
echo "== proof: the events backup holds no plaintext PII, but the amounts are in it =="
sh_pg "echo \"lines matching Alice|alice@|Lilas: \$(grep -cE 'Alice|alice@|Lilas' /tmp/events-backup.sql)\"; echo \"lines matching 42.50: \$(grep -c '42.50' /tmp/events-backup.sql)\""
echo "== alice asks to be forgotten =="
npm run --silent erase -- alice@example.com
echo "== proof: her events cannot be deleted, the log is append-only =="
psql -d events -c "DELETE FROM events WHERE type = 'CustomerRegistered'" || true
echo "== proof: read everything back. alice's rows are still there, her PII is gone, bob is untouched =="
npm run --silent read -- --email alice@example.com
psql -d events -c "SELECT left(subject_id::text, 8) AS subject, count(*) AS events, sum((data->>'amount')::numeric) AS total_amount FROM events GROUP BY subject_id ORDER BY 1"
psql -d keys -c "SELECT count(*) AS keys_left FROM subject_keys"
echo "== restore the pre-erasure events backup into a fresh database events_restored =="
psql -c "CREATE DATABASE events_restored"
sh_pg "psql -q -o /dev/null -U postgres -d events_restored < /tmp/events-backup.sql"
echo "== proof: alice is unreadable in the restored backup too; no one had to edit it =="
npm run --silent read -- --events events_restored
echo "== cautionary proof: restore the keys backup as well, and alice is back =="
psql -c "CREATE DATABASE keys_restored"
sh_pg "psql -q -o /dev/null -U postgres -d keys_restored < /tmp/keys-backup.sql"
npm run --silent read -- --events events_restored --keys keys_restored --email alice@example.com
echo "== the key store's backups must be short-lived (or erasures replayed after restore); dropping the restored copy and the dump =="
psql -c "DROP DATABASE keys_restored"
sh_pg "rm /tmp/keys-backup.sql && ls /tmp/*-backup.sql"
