import { randomUUID } from "node:crypto";
import pg from "pg";
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
  const id = randomUUID();
  await c.query("INSERT INTO outbox (id, aggregatetype, aggregateid, type, payload) VALUES ($1, 'order', $2, $3, $4)", [
    id,
    String(orderId),
    type,
    payload,
  ]);
  console.log(`   outbox <- ${type} id=${id}`);
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

function shipOrder(orderId: number, carrier: string) {
  return tx(async (c) => {
    await c.query("UPDATE orders SET status = 'shipped' WHERE id = $1", [orderId]);
    await emit(c, orderId, "OrderShipped", { orderId, carrier });
    await c.query("DELETE FROM outbox WHERE aggregateid = $1", [String(orderId)]);
    console.log("   all outbox rows for this order deleted, OrderShipped in the transaction that inserted it (the WAL still has every insert)");
  });
}

async function naiveDualWrite(customer: string) {
  const { rows } = await pool.query("INSERT INTO orders (customer, status, total) VALUES ($1, 'placed', 5.00) RETURNING id", [customer]);
  console.log(`   order ${rows[0].id} committed to Postgres`);
  console.log("   process crashes before producer.send(OrderPlaced) -> nothing will ever publish it");
}

async function main() {
  step("1. Business write + event in one transaction", "orders row and outbox row commit together; Debezium publishes the outbox row, the app never talks to Kafka");
  const id = await placeOrder("alice", "42.50");
  step("2. Every state change emits an intent-level event", "the event says OrderPaid, not 'status column changed'");
  await payOrder(id);
  step("3. Rollback drops the event too", "business write fails -> transaction rolls back -> outbox row never existed -> no event");
  await placeOrder("bob", "99.00", true).catch((err) => console.log(`   rejected: ${err instanceof Error ? err.message : String(err)}`));
  step("4. Outbox can be cleaned immediately", "insert + delete in one tx: table stays small, Debezium reads the insert from the WAL, EventRouter ignores the delete");
  await shipOrder(id, "UPS");
  step("5. Contrast: naive dual write (simulated crash)", "commit DB then publish separately: a crash between the two loses the event forever");
  await naiveDualWrite("carol");
  await pool.end();
}

main();
