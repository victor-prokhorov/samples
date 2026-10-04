import { check } from "./check.js";
import { balances, closeAll, inventoryDb } from "./db.js";
import { SERVICES } from "./services.js";

// Final state of every database once the five sagas are done: each service agrees with the others.
async function main() {
  console.log("\n## verify: every service's database agrees");
  const b = await balances();
  check("orders: A, D, E completed; B, C rejected", b.orders === "order-A:completed, order-B:rejected, order-C:rejected, order-D:completed, order-E:completed");
  check("inventory: 10 - 2 (A) - 1 (D) - 1 (E) = 6 left, reservations only for A, D, E", b.stock === "6" && b.reservations === "order-A:2, order-D:1, order-E:1");
  check("payments: C refunded, B never charged", b.charges === "order-A:84.00:charged, order-C:126.00:refunded, order-D:42.00:charged, order-E:42.00:charged");
  check("shipping: only A, D, E", b.shipments === "order-A, order-D, order-E");
  const d = await inventoryDb.query("SELECT count(*)::int AS n FROM processed_messages WHERE order_id = 'order-D' AND type = 'OrderPlaced'");
  check("inventory processed OrderPlaced for order-D once, although Kafka delivered it twice", d.rows[0].n === 1);
  const unpublished = await Promise.all(SERVICES.map((s) => s.db.query("SELECT count(*)::int AS n FROM outbox WHERE published_at IS NULL")));
  check("every outbox is drained", unpublished.every((r) => r.rows[0].n === 0));
  await closeAll();
}

main();
