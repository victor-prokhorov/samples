import { check } from "./check.js";
import { rejection, step } from "./log.js";
import { Router } from "./router.js";
import { closeAll, discover } from "./topology.js";

async function main() {
  const shards = discover();
  const router = new Router(shards);
  const customers = ["alice", "bob", "carol", "dave", "erin"];
  const healthy = customers.find((c) => router.shardFor(c).id === 0);
  const down = customers.find((c) => router.shardFor(c).id === 1);
  if (!healthy || !down) throw new Error("need one customer on each shard");
  step("8. Shard 1 primary is down: writes are CP", "no failover: the shard refuses writes instead of letting a replica diverge (no split brain)");
  const refused = await rejection(() => router.write(down, "INSERT INTO orders (customer_id, item) VALUES ($1, 'pen')", [down]));
  console.log(`   write ${down} -> shard1-primary rejected: ${refused}`);
  const ok = await router.write(healthy, "INSERT INTO orders (customer_id, item) VALUES ($1, 'pen') RETURNING id", [healthy]);
  console.log(`   write ${healthy} -> ${ok.node} ok (id ${ok.rows[0].id}): the other shard is unaffected`);
  check(`a write for ${down} is refused while shard 1's primary is down (no replica takes over)`, refused.includes("ECONNREFUSED"));
  check(`a write for ${healthy} on shard 0 still succeeds`, ok.node === "shard0-primary");
  step("9. Shard 1 reads stay available: AP", "replicas keep serving the last data they replayed; they stay read-only (not promoted)");
  const answers: string[] = [];
  for (let i = 0; i < shards[1].replicas.length; i++) {
    const r = await router.read(down, "SELECT count(*)::int AS n, pg_is_in_recovery() AS replica FROM orders WHERE customer_id = $1", [down]);
    console.log(`   read ${down} -> ${r.node}: ${r.rows[0].n} orders (in recovery: ${r.rows[0].replica})`);
    if (r.rows[0].replica === true && r.rows[0].n === 1) answers.push(r.node);
  }
  check(`every shard 1 replica still answers reads of ${down} (1 order), and stays a replica`, new Set(answers).size === shards[1].replicas.length);
  await closeAll(shards);
}

main();
