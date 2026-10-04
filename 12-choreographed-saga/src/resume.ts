import { settle, startServices } from "./bus.js";
import { check } from "./check.js";
import { balances, closeAll, inventoryDb } from "./db.js";
import { SERVICES, placeOrder } from "./services.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

async function main() {
  step("6. Restart: redelivery is a no-op", "Kafka redelivers OrderPlaced for order-D from the last committed offset; its event_id is already in inventory's processed_messages, so nothing is reserved twice. The relay then publishes the InventoryReserved that the crashed transaction had already committed, and the saga goes on");
  const processedD = () => inventoryDb.query("SELECT count(*)::int AS n FROM processed_messages WHERE order_id = 'order-D' AND type = 'OrderPlaced'");
  const before = await balances();
  check("after the crash order-D is pending, yet inventory committed its reservation and the processed OrderPlaced", before.orders.includes("order-D:pending") && before.reservations.includes("order-D:1") && (await processedD()).rows[0].n === 1);
  const services = await startServices(SERVICES);
  await settle(SERVICES);
  const after = await balances();
  check("after the restart order-D completed, reserved once (stock 10 - 2 - 1 = 7) and charged once", after.orders.includes("order-D:completed") && after.stock === "7" && after.charges.includes("order-D:42.00:charged") && (await processedD()).rows[0].n === 1);
  step("7. One topic lags: events arrive out of order", "Kafka orders events per partition of one topic, not across topics; orders stops reading inventory-events for a while, so it sees PaymentCharged before InventoryReserved. Its state machine only moves forward, so the late event cannot undo anything");
  await services.pause("orders", "inventory-events");
  console.log("   [orders] paused on inventory-events (a slow partition, a lagging consumer)");
  await placeOrder("order-E", { sku: "keyboard", qty: 1, amount: "42.00", address: "Lille" });
  await settle(SERVICES);
  console.log("   [orders] resumed on inventory-events");
  services.resume("orders", "inventory-events");
  await settle(SERVICES);
  check("order-E completed, and the late InventoryReserved did not move it back", (await balances()).orders.includes("order-E:completed"));
  await services.stop();
  await closeAll();
}

main();
