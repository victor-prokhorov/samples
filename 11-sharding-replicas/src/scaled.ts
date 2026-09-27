import { step } from "./log.js";
import { Router } from "./router.js";
import { closeAll, discover } from "./topology.js";

async function main() {
  const shards = discover();
  const router = new Router(shards);
  step("7. Scale reads", "more replicas were started with docker compose --scale; the router discovers them, no primary change");
  for (const s of shards) {
    const customer = ["alice", "bob", "carol", "dave", "erin"].find((c) => router.shardFor(c) === s);
    if (!customer) continue;
    const hits = new Map<string, number>();
    for (let i = 0; i < s.replicas.length * 2; i++) {
      const r = await router.read(customer, "SELECT count(*)::int AS n FROM orders WHERE customer_id = $1", [customer]);
      hits.set(r.node, (hits.get(r.node) ?? 0) + 1);
    }
    console.log(`   shard ${s.id} (${s.replicas.length} replicas), ${s.replicas.length * 2} reads of ${customer}: ${[...hits].map(([n, c]) => `${n}=${c}`).join(", ")}`);
  }
  await closeAll(shards);
}

main();
