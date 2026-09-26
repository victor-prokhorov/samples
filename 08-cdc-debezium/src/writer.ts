import pg from "pg";
import { PG_URL } from "./config.js";

async function main() {
  const client = new pg.Client(PG_URL);
  await client.connect();
  console.log("writer: plain SQL, the app knows nothing about Kafka");
  const { rows } = await client.query("INSERT INTO orders (customer, status, total) VALUES ('alice', 'pending', 42.50) RETURNING id");
  const id = rows[0].id;
  console.log(`writer: INSERT order ${id}`);
  await client.query("UPDATE orders SET status = 'paid' WHERE id = $1", [id]);
  console.log(`writer: UPDATE order ${id} status=paid`);
  await client.query("BEGIN");
  await client.query("UPDATE orders SET status = 'shipped' WHERE id = $1", [id]);
  await client.query("INSERT INTO orders (customer, status, total) VALUES ('bob', 'pending', 10.00)");
  await client.query("COMMIT");
  console.log(`writer: one transaction -> UPDATE order ${id} status=shipped + INSERT bob (expect same tx id)`);
  await client.query("BEGIN");
  await client.query("DELETE FROM orders WHERE customer = 'bob'");
  await client.query("ROLLBACK");
  console.log("writer: DELETE bob then ROLLBACK (expect no event: logical decoding only emits committed transactions)");
  await client.query("DELETE FROM orders WHERE id = $1", [id]);
  console.log(`writer: DELETE order ${id}`);
  await client.end();
}

main();
