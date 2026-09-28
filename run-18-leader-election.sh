#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/18-leader-election.log) 2>&1
cd 18-leader-election
echo "# 18-leader-election run $(date -u +%FT%TZ)"
echo "== fresh Postgres (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait 2>&1 | tail -1
npm install --silent --no-audit --no-fund
trap 'kill -9 $(jobs -p) 2>/dev/null || true' EXIT
psql() { docker compose exec -T postgres psql -U postgres "$@"; }
start() { node --import tsx src/replica.ts "$@" & eval "pid_$1=$!"; }
pid() { eval "echo \$pid_$1"; }
leader() { psql -tAc "SELECT holder FROM leases WHERE expires_at > now()"; }
note() { echo "   $(date -u +%T) $*"; }
until_leader_is_not() {
  for _ in $(seq 1 50); do
    l=$(leader)
    [ -n "$l" ] && [ "$l" != "$1" ] && return
    sleep 0.2
  done
  echo "no new leader after 10s"; exit 1
}
pause_then_resume() {
  note "kill -$2 $1: $3"
  kill -"$2" "$(pid "$1")"
  for _ in $(seq 1 30); do
    [[ "$(ps -o stat= -p "$(pid "$1")")" == T* ]] && break
    sleep 0.1
  done
  until_leader_is_not "$1"
  sleep 1.5
  note "kill -CONT $1, after $(leader) took over"
  kill -CONT "$(pid "$1")"
  sleep 2.5
}
npm run --silent setup
npm run --silent step -- 1
for r in a b c; do start "$r" --no-election; done
sleep 3.5
for r in a b c; do kill "$(pid "$r")"; wait "$(pid "$r")" || true; done
echo "== proof: without election the job ran three times every second =="
psql -c "SELECT to_char(date_trunc('second', at), 'HH24:MI:SS') AS second, count(*) AS runs, string_agg(holder, ', ' ORDER BY holder) AS by FROM ticks GROUP BY 1 ORDER BY 1"
psql -qc "TRUNCATE ticks"
npm run --silent step -- 2
for r in a b c; do start "$r"; done
sleep 3.5
echo "== proof: one lease row, one holder; expires_at is on the database clock =="
psql -c "SELECT name, holder, term, to_char(renewed_at, 'HH24:MI:SS.FF1') AS renewed_at, to_char(expires_at, 'HH24:MI:SS.FF1') AS expires_at, round(extract(epoch FROM expires_at - now())::numeric, 1) AS expires_in_s FROM leases"
npm run --silent step -- 3
first=$(leader)
note "kill -9 $first (pid $(pid "$first"))"
kill -9 "$(pid "$first")"
wait "$(pid "$first")" 2>/dev/null || true
until_leader_is_not "$first"
second=$(leader)
note "$second holds the lease"
sleep 2
npm run --silent step -- 4
pause_then_resume "$second" USR2 "stop right after the next renew"
npm run --silent step -- 5
third=$(leader)
pause_then_resume "$third" USR1 "stop right after the next lease check"
npm run --silent step -- 6
last=$(leader)
note "kill -TERM $last"
kill "$(pid "$last")"
wait "$(pid "$last")" || true
until_leader_is_not "$last"
sleep 1.5
for r in a b c; do kill "$(pid "$r")" 2>/dev/null && wait "$(pid "$r")" || true; done
echo "== proof: one row per leader change in ticks, with the gap since the previous job run =="
psql -c "SELECT id, holder, term, to_char(at, 'HH24:MI:SS.FF1') AS at, gap_s FROM (SELECT *, lag(holder) OVER w AS prev, round(extract(epoch FROM at - lag(at) OVER w)::numeric, 1) AS gap_s FROM ticks WINDOW w AS (ORDER BY id)) t WHERE prev IS DISTINCT FROM holder ORDER BY id"
echo "== proof: from $third's last write before its pause on, ticks took the stale write, fenced_ticks did not =="
for t in ticks fenced_ticks; do
  psql -c "SELECT id, holder, term, to_char(at, 'HH24:MI:SS.FF1') AS at FROM $t WHERE term IN (3, 4) AND id >= (SELECT max(id) FROM $t WHERE term = 3 AND id < (SELECT min(id) FROM $t WHERE term = 4)) ORDER BY id"
done
psql -c "SELECT * FROM fence"
npm run --silent step -- 7
node --import tsx src/advisory.ts hold &
holder=$!
sleep 1.5
psql -c "SELECT locktype, objid, pid, mode, granted FROM pg_locks WHERE locktype = 'advisory'"
node --import tsx src/advisory.ts take 0
note "kill -STOP the holder (pid $holder)"
kill -STOP "$holder"
node --import tsx src/advisory.ts take 4000
note "kill -CONT, then kill -9 the holder"
kill -CONT "$holder"
kill -9 "$holder"
wait "$holder" 2>/dev/null || true
node --import tsx src/advisory.ts take 4000
echo "== proof: what ends a session whose client vanished without closing it (0 = off, or the OS default for keepalives) =="
psql -c "SELECT name, setting, unit FROM pg_settings WHERE name IN ('tcp_keepalives_idle', 'tcp_keepalives_interval', 'tcp_keepalives_count', 'tcp_user_timeout', 'idle_session_timeout') ORDER BY name"
docker compose exec -T postgres sh -c 'cd /proc/sys/net/ipv4 && grep . tcp_keepalive_time tcp_keepalive_intvl tcp_keepalive_probes'
npm run --silent step -- 8
node --import tsx src/advisory.ts pooler
