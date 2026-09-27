#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
exec > >(tee logs/11-sharding-replicas.log) 2>&1
cd 11-sharding-replicas
echo "# 11-sharding-replicas run $(date -u +%FT%TZ)"
echo "== fresh cluster: 2 shard primaries, 2 replicas each (docker compose down -v && up) =="
docker compose down -v --remove-orphans >/dev/null 2>&1
docker compose up -d --wait >/dev/null 2>&1
echo "running containers: $(docker compose ps --status running -q | wc -l | tr -d ' ')"
npm install --silent --no-audit --no-fund
psql() { local node=$1; shift; docker compose exec -T "$node" psql -U postgres "$@"; }
npm run --silent setup
npm run --silent demo
echo
echo "== scale reads: docker compose up -d --scale shard0-replica=4 --scale shard1-replica=3 =="
docker compose up -d --wait --no-recreate --scale shard0-replica=4 --scale shard1-replica=3 >/dev/null 2>&1
echo "running containers: $(docker compose ps --status running -q | wc -l | tr -d ' ')"
npm run --silent scaled
echo
echo "== proof: each primary streams its WAL to its own replicas =="
psql shard0-primary -c "SELECT application_name, state, replay_lsn FROM pg_stat_replication ORDER BY 1"
psql shard1-primary -c "SELECT application_name, state, replay_lsn FROM pg_stat_replication ORDER BY 1"
echo "== outage: docker compose stop shard1-primary =="
docker compose stop shard1-primary 2>&1 | tail -1
npm run --silent outage
echo
echo "== recovery: docker compose start shard1-primary, replicas reconnect on their own =="
docker compose start --wait shard1-primary 2>&1 | tail -1
for _ in $(seq 1 60); do
  n=$(psql shard1-primary -tAc "SELECT count(*) FROM pg_stat_replication WHERE state = 'streaming'")
  [ "$n" = 3 ] && break
  sleep 1
done
[ "$n" = 3 ] || { echo "shard1 replicas did not reconnect (streaming: $n)"; exit 1; }
psql shard1-primary -c "SELECT application_name, state FROM pg_stat_replication ORDER BY 1"
echo "== proof: each shard holds only its own customers; ids are per shard (no global sequence) =="
psql shard0-primary -c "SELECT * FROM orders ORDER BY id"
psql shard1-primary -c "SELECT * FROM orders ORDER BY id"
echo "== proof: a replica is the same data, in recovery (read-only) =="
docker compose exec -T --index 4 shard0-replica psql -U postgres -c "SELECT pg_is_in_recovery(), count(*) AS orders FROM orders"
