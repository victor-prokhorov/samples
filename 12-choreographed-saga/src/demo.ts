import { listensTo, settle, startServices } from "./bus.js";
import { check } from "./check.js";
import { balances, closeAll } from "./db.js";
import { SERVICES, placeOrder } from "./services.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function wiring() {
  for (const s of SERVICES) console.log(`   ${s.name.padEnd(9)} publishes ${s.topic} (${s.emits.join(", ")}), listens to ${listensTo(SERVICES, s).join(", ")}`);
  const cycles = SERVICES.flatMap((a, i) => SERVICES.slice(i + 1).filter((b) => listensTo(SERVICES, a).includes(b.topic) && listensTo(SERVICES, b).includes(a.topic)).map((b) => `${a.name} <-> ${b.name}`));
  console.log(`   cycles, each side depends on the other's events: ${cycles.join(", ")}`);
}

async function main() {
  console.log("note: each [service] is a separate microservice with its own database, outbox, relay and Kafka consumer group; in this toy the four run in one process against four Postgres databases in one container");
  step("1. Who listens to whom", "no orchestrator and no step table: the flow is the sum of each service's subscriptions, read from src/services.ts");
  wiring();
  const services = await startServices(SERVICES, "inventory:OrderPlaced:order-D");
  step("2. Happy path", "each service reacts to the previous event and publishes its own; the effect, the processed event and the outgoing event commit in one local transaction");
  await placeOrder("order-A", { sku: "keyboard", qty: 2, amount: "84.00", address: "Paris" });
  await settle(SERVICES);
  const afterA = await balances();
  check(
    "order-A completed: 2 reserved (stock 8), 84.00 charged, shipped",
    afterA.orders === "order-A:completed" && afterA.stock === "8" && afterA.charges === "order-A:84.00:charged" && afterA.shipments === "order-A",
  );
  step("3. Payment fails", "payments publishes PaymentFailed; inventory reacts by releasing, orders by rejecting; nobody tells them to");
  await placeOrder("order-B", { sku: "keyboard", qty: 1, amount: "5000.00", address: "Paris" });
  await settle(SERVICES);
  const afterB = await balances();
  check("order-B rejected; the release left stock, charges and shipments as before it", afterB.orders === "order-A:completed, order-B:rejected" && afterB.stock === afterA.stock && afterB.reservations === afterA.reservations && afterB.charges === afterA.charges && afterB.shipments === afterA.shipments);
  step("4. Last step fails", "ShipmentFailed makes payments refund, PaymentRefunded makes inventory release: the compensation runs in reverse, one event at a time");
  await placeOrder("order-C", { sku: "keyboard", qty: 3, amount: "126.00", address: "nowhere" });
  await settle(SERVICES);
  const afterC = await balances();
  check("order-C rejected; refund then release left stock and shipments as before it", afterC.orders.endsWith("order-C:rejected") && afterC.stock === afterB.stock && afterC.reservations === afterB.reservations && afterC.shipments === afterB.shipments);
  check("order-C's charge is kept as refunded", afterC.charges === "order-A:84.00:charged, order-C:126.00:refunded");
  step("5. A consumer crashes before committing its Kafka offset", "inventory commits its reservation and InventoryReserved, then dies before Kafka records that it consumed OrderPlaced (the resume process picks it up)");
  await placeOrder("order-D", { sku: "keyboard", qty: 1, amount: "42.00", address: "Lyon" });
  await settle(SERVICES);
  await services.stop();
  await closeAll();
}

main();
