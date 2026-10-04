import { check } from "./check.js";
import { Router } from "./router.js";
import { closeAll, discover } from "./topology.js";

// After the recovery: each shard holds only its own customers, and every replica has caught up with its primary.
async function main() {
  console.log("\n## verify: shards and replicas after the recovery");
  const shards = discover();
  const router = new Router(shards);
  for (const s of shards) {
    const { rows } = await s.primary.pool.query("SELECT DISTINCT customer_id FROM orders ORDER BY 1");
    const customers = rows.map((r) => r.customer_id as string);
    check(`shard ${s.id} holds only its own customers (${customers.join(", ")})`, customers.length > 0 && customers.every((c) => router.shardFor(c) === s));
    const { rows: lsn } = await s.primary.pool.query("SELECT pg_current_wal_lsn()::text AS lsn, count(*)::int AS n FROM orders");
    let caughtUp = true;
    for (const r of s.replicas) {
      for (let i = 0; i < 50; i++) {
        const { rows: done } = await r.pool.query("SELECT pg_last_wal_replay_lsn() >= $1::pg_lsn AS done", [lsn[0].lsn]);
        if (done[0].done) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const { rows: replica } = await r.pool.query("SELECT pg_is_in_recovery() AS replica, count(*)::int AS n FROM orders");
      caughtUp &&= replica[0].replica === true && replica[0].n === lsn[0].n;
    }
    check(`shard ${s.id}: all ${s.replicas.length} replicas are read-only copies with the primary's ${lsn[0].n} orders`, caughtUp);
  }
  await closeAll(shards);
}

main();
