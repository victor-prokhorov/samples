import { randomUUID } from "node:crypto";
import pg from "pg";
import { check } from "./check.js";
import { PG_URL } from "./config.js";

const pool = new pg.Pool({ connectionString: PG_URL });

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function emit(c: pg.PoolClient, orderId: number, type: string, payload: object) {
  const eventId = randomUUID();
  await c.query("INSERT INTO outbox (event_id, aggregate_id, type, payload) VALUES ($1, $2, $3, $4)", [eventId, String(orderId), type, payload]);
  console.log(`   outbox <- ${type} event_id=${eventId}`);
}

function placeOrder(customer: string, total: string, failAfterWrite = false) {
  return tx(async (c) => {
    const { rows } = await c.query("INSERT INTO orders (customer, status, total) VALUES ($1, 'placed', $2) RETURNING id", [customer, total]);
    await emit(c, rows[0].id, "OrderPlaced", { orderId: rows[0].id, customer, total });
    if (failAfterWrite) throw new Error(`payment provider down, order ${rows[0].id} aborted`);
    return rows[0].id as number;
  });
}

function payOrder(orderId: number) {
  return tx(async (c) => {
    await c.query("UPDATE orders SET status = 'paid' WHERE id = $1", [orderId]);
    await emit(c, orderId, "OrderPaid", { orderId });
  });
}

async function main() {
  step("1. Business write + event in one transaction", "orders row and outbox row commit together; the app does not talk to Kafka");
  const id = await placeOrder("alice", "42.50");
  step("2. Next state change, next event", "each event is a row waiting for the relay (published_at IS NULL)");
  await payOrder(id);
  step("3. Rollback drops the event too", "business write fails -> whole transaction rolls back -> no outbox row to publish");
  await placeOrder("bob", "99.00", true).catch((err) => console.log(`   rejected: ${err instanceof Error ? err.message : String(err)}`));
  const orders = await pool.query("SELECT customer, status FROM orders ORDER BY id");
  const outbox = await pool.query("SELECT type, aggregate_id, published_at FROM outbox ORDER BY id");
  check("alice's order is paid and bob's rolled back: one order row", orders.rows.map((r) => `${r.customer}:${r.status}`).join() === "alice:paid");
  check("two events wait in the outbox, both for alice's order; bob's event rolled back with his order", outbox.rows.map((r) => `${r.type}:${r.aggregate_id}:${r.published_at}`).join() === `OrderPlaced:${id}:null,OrderPaid:${id}:null`);
  await pool.end();
}

main();
