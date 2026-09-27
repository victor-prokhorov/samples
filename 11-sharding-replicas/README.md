# 11-sharding-replicas

The partitions of `10-partitioning` turned into servers. Two shards, each a Postgres primary with read replicas fed by built-in streaming replication. A small router in the app hashes `customer_id` to a shard, sends writes to that shard's primary and spreads reads over its replicas. No Citus, no proxy, no failover. No query or transaction spans shards: cross-shard reads would need fan-out and merge in the router, cross-shard writes a saga (06).

```sh
docker compose up -d --wait                                                  # 2 primaries, 2 replicas each
npm i
npm run setup                                                                # orders on each primary, wait for replicas
npm run demo                                                                 # routing, read-only replicas, round-robin, stale read, catch-up
docker compose up -d --wait --no-recreate --scale shard0-replica=4 --scale shard1-replica=3
npm run scaled                                                               # router discovers the new replicas
docker compose stop shard1-primary
npm run outage                                                               # shard 1 writes fail, its reads still work
docker compose start shard1-primary
```

- `docker-compose.yml` the primary settings (`wal_keep_size`, `max_wal_senders`, `hba_file`; `wal_level=replica` is the default, set for visibility) and the replica service (`deploy.replicas: 2`, random host port so it can scale).
- `scripts/primary-init.sql` the `replicator` role; `scripts/pg_hba.conf` lets it connect for replication.
- `scripts/replica.sh` on first start, `pg_basebackup -R` clones the primary and writes `standby.signal` + `primary_conninfo`; then it starts Postgres as a hot standby.
- `src/topology.ts` primaries on fixed ports, replicas discovered from `docker compose ps`.
- `src/router.ts` `shardFor`, `write` (primary only), `read` (replicas, round-robin, skip a dead one).

One-shot run with proof: `../run-11-sharding-replicas.sh` (log in `../logs/11-sharding-replicas.log`). Concepts explained in `../README.md`.
