import { db, tx } from "./db.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

async function rejection(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  throw new Error("expected a rejection, but the operation succeeded");
}

async function plan(sql: string, params: unknown[] = []) {
  const { rows } = await db.query(`EXPLAIN (COSTS OFF) ${sql}`, params);
  for (const r of rows) console.log(`     ${r["QUERY PLAN"]}`);
}

async function main() {
  step("1. Postgres routes each row", "the app inserts into the parent table; Postgres hashes customer_id and stores the row in one partition");
  for (const [customer, item] of [["alice", "keyboard"], ["alice", "mouse"], ["bob", "screen"], ["carol", "desk"], ["dave", "chair"], ["erin", "lamp"]]) {
    const { rows } = await db.query("INSERT INTO orders (customer_id, item) VALUES ($1, $2) RETURNING tableoid::regclass AS partition, id", [customer, item]);
    console.log(`   ${customer.padEnd(5)} ${item.padEnd(8)} -> ${rows[0].partition} (id ${rows[0].id})`);
  }
  step("2. Partition pruning", "a query that filters on the partition key only touches the matching partition");
  await plan("SELECT * FROM orders WHERE customer_id = $1", ["alice"]);
  step("3. No key, no pruning", "without the partition key every partition is scanned (in sharding: every shard is queried)");
  await plan("SELECT * FROM orders WHERE item = $1", ["lamp"]);
  step("4. Uniqueness must include the key", "each partition has its own index, so Postgres cannot enforce uniqueness on id alone");
  console.log(`   rejected: ${await rejection(() => db.query("ALTER TABLE orders ADD CONSTRAINT orders_id_unique UNIQUE (id)"))}`);
  step("5. Still one server", "one transaction can span partitions and rolls back atomically; after sharding (11) this is no longer true");
  const refused = await rejection(() =>
    tx(async (c) => {
      await c.query("INSERT INTO orders (customer_id, item) VALUES ('alice', 'cable')");
      await c.query("INSERT INTO orders (customer_id, item) VALUES ('bob', NULL)");
    }),
  );
  console.log(`   rejected: ${refused}`);
  const { rows } = await db.query("SELECT count(*)::int AS n FROM orders WHERE item = 'cable'");
  console.log(`   alice's cable rows after rollback: ${rows[0].n}`);
  step("6. Changing the key moves the row", "UPDATE of customer_id deletes from one partition and inserts into another, in the same transaction");
  const moved = await db.query("UPDATE orders SET customer_id = 'frank' WHERE item = 'lamp' RETURNING tableoid::regclass AS partition");
  console.log(`   erin's lamp now belongs to frank -> ${moved.rows[0].partition}`);
  await db.end();
}

main();
