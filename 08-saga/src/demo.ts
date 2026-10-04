import { check } from "./check.js";
import { closeAll, inventoryDb, orchestratorDb, paymentsDb, shippingDb } from "./db.js";
import { startSaga } from "./orchestrator.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

// What every service holds right now: stock left, money kept (charged, not refunded), shipments.
async function balances() {
  const stock = await inventoryDb.query("SELECT available FROM stock WHERE sku = 'keyboard'");
  const kept = await paymentsDb.query("SELECT coalesce(sum(amount) FILTER (WHERE status = 'charged'), 0)::text AS kept FROM charges");
  const shipped = await shippingDb.query("SELECT count(*)::int AS n FROM shipments");
  return { stock: stock.rows[0].available as number, kept: kept.rows[0].kept as string, shipments: shipped.rows[0].n as number };
}

const sagaState = async (id: string) => (await orchestratorDb.query("SELECT state, step FROM sagas WHERE id = $1", [id])).rows[0];
const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  console.log("note: each '-> HTTP' line is a network call to a separate microservice that owns a remote database; in this toy it is a function call in src/services.ts against its own local Postgres database");
  step("1. Happy path", "three local transactions in three databases, one after another; the saga log records progress after each");
  await startSaga("order-A", { sku: "keyboard", qty: 2, amount: "84.00", address: "Paris" });
  const afterA = await balances();
  check("order-A completed: 2 reserved (stock 8), 84.00 charged, 1 shipment", (await sagaState("order-A")).state === "completed" && same(afterA, { stock: 8, kept: "84.00", shipments: 1 }));
  step("2. Payment fails", "no distributed rollback exists; the orchestrator undoes completed steps with compensating actions, in reverse");
  await startSaga("order-B", { sku: "keyboard", qty: 1, amount: "5000.00", address: "Paris" });
  const afterB = await balances();
  check("order-B aborted and its compensation left every balance as it was before it", (await sagaState("order-B")).state === "aborted" && same(afterB, afterA));
  const chargedB = await paymentsDb.query("SELECT 1 FROM charges WHERE saga_id = 'order-B'");
  check("order-B was never charged", chargedB.rowCount === 0);
  step("3. Last step fails", "shipping refuses: refund the charge, then release the stock");
  await startSaga("order-C", { sku: "keyboard", qty: 3, amount: "126.00", address: "nowhere" });
  const afterC = await balances();
  check("order-C aborted and its compensation (refund, then release) left every balance as it was before it", (await sagaState("order-C")).state === "aborted" && same(afterC, afterB));
  const chargedC = await paymentsDb.query("SELECT status FROM charges WHERE saga_id = 'order-C'");
  check("order-C's charge is kept as refunded, not deleted", chargedC.rows.map((r) => r.status).join() === "refunded");
  step("4. Orchestrator crashes mid-saga", "the charge ran but the log was not updated; the process dies here (resume picks it up)");
  await startSaga("order-D", { sku: "keyboard", qty: 1, amount: "42.00", address: "Lyon" }, "chargePayment");
  await closeAll();
}

main();
