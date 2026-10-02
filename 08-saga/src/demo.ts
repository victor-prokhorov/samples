import { closeAll } from "./db.js";
import { startSaga } from "./orchestrator.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

async function main() {
  console.log("note: each '-> HTTP' line is a network call to a separate microservice that owns a remote database; in this toy it is a function call in src/services.ts against its own local Postgres database");
  step("1. Happy path", "three local transactions in three databases, one after another; the saga log records progress after each");
  await startSaga("order-A", { sku: "keyboard", qty: 2, amount: "84.00", address: "Paris" });
  step("2. Payment fails", "no distributed rollback exists; the orchestrator undoes completed steps with compensating actions, in reverse");
  await startSaga("order-B", { sku: "keyboard", qty: 1, amount: "5000.00", address: "Paris" });
  step("3. Last step fails", "shipping refuses: refund the charge, then release the stock");
  await startSaga("order-C", { sku: "keyboard", qty: 3, amount: "126.00", address: "nowhere" });
  step("4. Orchestrator crashes mid-saga", "the charge ran but the log was not updated; the process dies here (resume picks it up)");
  await startSaga("order-D", { sku: "keyboard", qty: 1, amount: "42.00", address: "Lyon" }, "chargePayment");
  await closeAll();
}

main();
