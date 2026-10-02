import { db } from "./db.js";

const PARTITIONS = 4;

async function main() {
  await db.query("DROP TABLE IF EXISTS orders");
  await db.query(`
    CREATE TABLE orders (
      customer_id TEXT NOT NULL,
      id BIGSERIAL,
      item TEXT NOT NULL,
      PRIMARY KEY (customer_id, id)
    ) PARTITION BY HASH (customer_id)`);
  for (let i = 0; i < PARTITIONS; i++) {
    await db.query(`CREATE TABLE orders_p${i} PARTITION OF orders FOR VALUES WITH (MODULUS ${PARTITIONS}, REMAINDER ${i})`);
  }
  console.log(`setup: orders PARTITION BY HASH (customer_id) into ${PARTITIONS} partitions (orders_p0..orders_p${PARTITIONS - 1})`);
  await db.end();
}

main();
