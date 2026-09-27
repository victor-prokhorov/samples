# 10-partitioning

**Pain: table too big.** One huge table means huge indexes, slow vacuum and expensive retention deletes.

Native Postgres hash partitioning on one server: `orders PARTITION BY HASH (customer_id)` into 4 partitions. The app only ever talks to `orders`; Postgres routes every row and prunes every query. This is the single-machine step before `11-sharding-replicas`, which moves the same split onto separate servers.

```sh
docker compose up -d --wait
npm i
npm run setup   # orders + orders_p0..orders_p3
npm run demo    # routing, pruning, full scan, unique limit, cross-partition tx, row move
```

- `src/setup.ts` the parent table and its 4 `FOR VALUES WITH (MODULUS 4, REMAINDER n)` partitions.
- `src/demo.ts` each scenario, with `EXPLAIN` plans.

Reach for it when one table got big enough that indexes, vacuum or retention hurt, and the hot queries filter on one key. Old data expires by time (`RANGE` by month, then `DROP` old partitions instead of a huge `DELETE`).

Do not reach for it when the table is small: partitioning adds planning cost and rules for nothing. Most queries do not filter on the partition key, so each one scans every partition. You expect more CPU, RAM or write throughput: it is still one machine (11). You need a unique constraint that does not include the key.

One-shot run with proof: `../run-10-partitioning.sh` (log in `../logs/10-partitioning.log`). Concepts explained in `../README.md`.
