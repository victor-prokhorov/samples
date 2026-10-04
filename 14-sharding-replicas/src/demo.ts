import { check } from "./check.js";
import { rejection, step } from "./log.js";
import { primaryLsn, waitForReceive, waitForReplay } from "./replication.js";
import { Router } from "./router.js";
import { Node, closeAll, discover } from "./topology.js";

async function count(node: Node, customer: string) {
  const { rows } = await node.pool.query("SELECT count(*)::int AS n FROM orders WHERE customer_id = $1", [customer]);
  return rows[0].n;
}

async function main() {
  const shards = discover();
  const router = new Router(shards);
  step("1. Topology", "the partitions of 10 (here two instead of four) each become their own server (a shard); each shard has one primary and N read replicas");
  for (const s of shards) console.log(`   shard ${s.id}: primary ${s.primary.name}, replicas ${s.replicas.map((r) => r.name).join(", ")}`);
  step("2. Writes go to the shard's primary", "the router (not Postgres) hashes customer_id to pick the shard; only its primary accepts the write");
  let routed = true;
  const used = new Set<string>();
  for (const [customer, item] of [["alice", "keyboard"], ["alice", "mouse"], ["bob", "screen"], ["carol", "desk"], ["dave", "chair"], ["erin", "lamp"]]) {
    const r = await router.write(customer, "INSERT INTO orders (customer_id, item) VALUES ($1, $2) RETURNING id", [customer, item]);
    console.log(`   ${customer.padEnd(5)} ${item.padEnd(8)} -> ${r.node} (id ${r.rows[0].id})`);
    routed &&= r.node === router.shardFor(customer).primary.name;
    used.add(r.node);
  }
  check("every write went to the primary of the customer's shard, and both shards got writes", routed && used.size === 2);
  step("3. Replicas refuse writes", "a replica replays the primary's WAL and is read-only; there is exactly one writer per shard");
  const refused = await rejection(() => shards[0].replicas[0].pool.query("INSERT INTO orders (customer_id, item) VALUES ('alice', 'hack')"));
  console.log(`   ${shards[0].replicas[0].name} rejected: ${refused}`);
  check("a replica refuses writes", refused.includes("read-only transaction"));
  const alice = router.shardFor("alice");
  await waitForReplay(alice.replicas, await primaryLsn(alice));
  step("4. Reads spread over the replicas", "the router round-robins reads across the shard's replicas; the primary serves no reads");
  const readers: string[] = [];
  for (let i = 0; i < 4; i++) {
    const r = await router.read("alice", "SELECT count(*)::int AS n FROM orders WHERE customer_id = $1", ["alice"]);
    console.log(`   read alice -> ${r.node}: ${r.rows[0].n} orders`);
    readers.push(r.node);
  }
  const names = alice.replicas.map((n) => n.name);
  check("reads alternate over the shard's replicas, never the primary", readers.join() === [...names, ...names].join());
  const [paused, ...others] = alice.replicas;
  step("5. Replicas are eventually consistent (AP)", `replay paused on ${paused.name} to simulate lag: it keeps answering, with old data`);
  await paused.pool.query("SELECT pg_wal_replay_pause()");
  try {
    const w = await router.write("alice", "INSERT INTO orders (customer_id, item) VALUES ('alice', 'cable') RETURNING id");
    console.log(`   write alice cable -> ${w.node} (committed)`);
    const lsn = await primaryLsn(alice);
    await waitForReceive(paused, lsn);
    await waitForReplay(others, lsn);
    const truth = await count(alice.primary, "alice");
    console.log(`   ${alice.primary.name.padEnd(18)} ${truth} orders (source of truth)`);
    const seen: number[] = [];
    for (const n of alice.replicas) {
      seen.push(await count(n, "alice"));
      console.log(`   ${n.name.padEnd(18)} ${seen[seen.length - 1]} orders`);
    }
    check(`the paused replica still answers, with old data (${truth - 1} orders); the others have all ${truth}`, seen[0] === truth - 1 && seen.slice(1).every((n) => n === truth));
    const lag = await paused.pool.query("SELECT pg_last_wal_receive_lsn()::text AS received, pg_last_wal_replay_lsn()::text AS replayed, pg_get_wal_replay_pause_state() AS state");
    console.log(`   ${paused.name}: WAL received up to ${lag.rows[0].received}, replayed up to ${lag.rows[0].replayed} (${lag.rows[0].state})`);
    for (let i = 0; i < alice.replicas.length; i++) {
      const r = await router.read("alice", "SELECT count(*)::int AS n FROM orders WHERE customer_id = $1", ["alice"]);
      console.log(`   read alice -> ${r.node}: ${r.rows[0].n} orders`);
    }
  } finally {
    await paused.pool.query("SELECT pg_wal_replay_resume()");
  }
  step("6. Lag heals", "resume replay: the replica applies the WAL it already holds and converges");
  await waitForReplay([paused], await primaryLsn(alice));
  const healed: number[] = [];
  for (const n of alice.replicas) {
    healed.push(await count(n, "alice"));
    console.log(`   ${n.name.padEnd(18)} ${healed[healed.length - 1]} orders`);
  }
  check("after resume every replica converges on the primary", healed.every((n) => n === healed[0]) && healed[0] === (await count(alice.primary, "alice")));
  await closeAll(shards);
}

main();
