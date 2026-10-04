import pg from "pg";
import { check } from "./check.js";
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
  const rolledBack = (await client.query("SELECT pg_current_xact_id()::text AS tx")).rows[0].tx;
  await client.query("ROLLBACK");
  console.log("writer: DELETE bob then ROLLBACK (expect no event: logical decoding only emits committed transactions)");
  await client.query("DELETE FROM orders WHERE id = $1", [id]);
  console.log(`writer: DELETE order ${id}`);
  const status = (await client.query("SELECT pg_xact_status($1::xid8) AS s", [rolledBack])).rows[0].s;
  check(`the DELETE bob transaction (${rolledBack}) is aborted according to Postgres`, status === "aborted");
  const bob = await client.query("SELECT 1 FROM orders WHERE customer = 'bob'");
  check("bob is still in the table", bob.rowCount === 1);
  await client.end();
}

main();
