import { closeAll } from "./db.js";
import { billing, orders } from "./services.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

async function main() {
  step("1. Business write + audit event in one transaction", "the app knows who acted and why (actor, reason), and writes the audit event into its own outbox in the same transaction as the change");
  const id = await orders.place("alice", "checkout", "alice", "42.50");
  await orders.changeTotal("bob (support)", "goodwill discount after late delivery", id, "38.25");
  step("2. Another service, its own outbox", "billing has its own database and its own audit_outbox; no service writes to the central audit store directly");
  await billing.invoice("system:billing", "order total confirmed", id, "38.25");
  step("3. Rollback drops the audit event too", "the change fails -> the whole transaction rolls back -> no audit event for a change that never happened");
  await orders.changeTotal("mallory", "price test", id, "0.01", true).catch((err) => console.log(`   rejected: ${err instanceof Error ? err.message : String(err)}`));
  await closeAll();
}

main();
