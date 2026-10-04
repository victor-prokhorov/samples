import { check } from "./check.js";
import { closeAll, inventoryDb, orchestratorDb, paymentsDb, shippingDb } from "./db.js";

// Final state of every database once all five sagas are done: each service is consistent with the saga log.
async function main() {
  console.log("\n## verify: every database agrees with the saga log");
  const rows = async (pool: typeof orchestratorDb, sql: string) => (await pool.query(sql)).rows.map((r) => Object.values(r).join(":")).join(", ");
  check("saga log: A, D, E completed; B, C aborted after compensating back to step 0", (await rows(orchestratorDb, "SELECT id, state, step FROM sagas ORDER BY id")) === "order-A:completed:4, order-B:aborted:0, order-C:aborted:0, order-D:completed:4, order-E:completed:4");
  check("inventory: 10 - 2 (A) - 1 (D) - 1 (E) = 6 left, reservations only for A, D, E", (await rows(inventoryDb, "SELECT available FROM stock")) === "6" && (await rows(inventoryDb, "SELECT saga_id FROM reservations ORDER BY saga_id")) === "order-A, order-D, order-E");
  check("payments: C refunded, D charged once, B never charged", (await rows(paymentsDb, "SELECT saga_id, status FROM charges ORDER BY saga_id")) === "order-A:charged, order-C:refunded, order-D:charged, order-E:charged");
  check("shipping: only the completed sagas A, D, E", (await rows(shippingDb, "SELECT saga_id FROM shipments ORDER BY saga_id")) === "order-A, order-D, order-E");
  await closeAll();
}

main();
