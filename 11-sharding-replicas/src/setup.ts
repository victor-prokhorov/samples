import { primaryLsn, waitForReplay } from "./replication.js";
import { closeAll, discover } from "./topology.js";

async function main() {
  const shards = discover();
  for (const shard of shards) {
    await shard.primary.pool.query("DROP TABLE IF EXISTS orders");
    await shard.primary.pool.query(`
      CREATE TABLE orders (
        customer_id TEXT NOT NULL,
        id BIGSERIAL,
        item TEXT NOT NULL,
        PRIMARY KEY (customer_id, id)
      )`);
    await waitForReplay(shard.replicas, await primaryLsn(shard));
    console.log(`setup: orders created on ${shard.primary.name}, replicated to ${shard.replicas.map((r) => r.name).join(", ")}`);
  }
  await closeAll(shards);
}

main();
