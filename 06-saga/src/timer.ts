import { closeAll } from "./db.js";
import { clock, startSaga } from "./orchestrator.js";

async function main() {
  console.log("\n## 6. Durable timer");
  console.log("   concept: a saga that has to wait (here a 30s fraud hold, in real life days) does not keep a process alive; it writes wake_at to the saga log and the process is free to exit");
  console.log(`   ${clock()} starting order-E`);
  await startSaga("order-E", { sku: "keyboard", qty: 1, amount: "42.00", address: "Lille", holdSec: 30 });
  console.log(`   ${clock()} timer process exits; order-E now exists only as a row`);
  await closeAll();
}

main();
