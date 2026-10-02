#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/26-sso.log) 2>&1
cd 26-sso
echo "# 26-sso run $(date -u +%FT%TZ)"
echo "== fresh Postgres for the app (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
npm run --silent setup
echo "== demo: browsers simulated with fetch and a cookie jar; the IdP and the app are separate processes =="
npm run --silent demo
echo
echo "== proof: users. Provisioned on first login, keyed by (issuer, sub), groups copied from the ID token =="
psql -c "SELECT id, issuer, sub, email, member_no, groups, first_login_at < last_login_at AS logged_in_again FROM users ORDER BY id"
echo "== proof: role_mappings joined to users. dave's group maps to nothing =="
psql -c "SELECT u.sub, g AS idp_group, m.role, m.employer FROM users u CROSS JOIN unnest(u.groups) g LEFT JOIN role_mappings m ON m.idp_group = g ORDER BY u.id"
echo "== proof: sessions. Only the sha256 of each cookie. alice has three: step 3's (her browser dropped the cookie in step 5; the row expires on its own), the alice-2 browser's, and the one after signing in again; the one she logged out of is gone =="
psql -c "SELECT left(s.id_hash, 16) AS id_hash, u.sub, s.expires_at - s.created_at AS lifetime, length(s.id_token) AS id_token_bytes FROM sessions s JOIN users u ON u.id = s.user_id ORDER BY s.created_at"
echo "== proof: login_transactions. Every one was consumed by its callback (none left behind) =="
psql -c "SELECT count(*) AS left_behind FROM login_transactions"
