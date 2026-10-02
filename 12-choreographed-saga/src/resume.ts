import { settle, startServices } from "./bus.js";
import { closeAll } from "./db.js";
import { SERVICES, placeOrder } from "./services.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

async function main() {
  step("6. Restart: redelivery is a no-op", "Kafka redelivers OrderPlaced for order-D from the last committed offset; its event_id is already in inventory's processed_messages, so nothing is reserved twice. The relay then publishes the InventoryReserved that the crashed transaction had already committed, and the saga goes on");
  const services = await startServices(SERVICES);
  await settle(SERVICES);
  step("7. One topic lags: events arrive out of order", "Kafka orders events per partition of one topic, not across topics; orders stops reading inventory-events for a while, so it sees PaymentCharged before InventoryReserved. Its state machine only moves forward, so the late event cannot undo anything");
  await services.pause("orders", "inventory-events");
  console.log("   [orders] paused on inventory-events (a slow partition, a lagging consumer)");
  await placeOrder("order-E", { sku: "keyboard", qty: 1, amount: "42.00", address: "Lille" });
  await settle(SERVICES);
  console.log("   [orders] resumed on inventory-events");
  services.resume("orders", "inventory-events");
  await settle(SERVICES);
  await services.stop();
  await closeAll();
}

main();
