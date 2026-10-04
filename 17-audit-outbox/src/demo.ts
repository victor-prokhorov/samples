import { check } from "./check.js";
import { billingDb, closeAll, ordersDb } from "./db.js";
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
  const outbox = async (db: typeof ordersDb) => (await db.query("SELECT entity, action, actor FROM audit_outbox ORDER BY id")).rows.map((r) => `${r.entity} ${r.action} by ${r.actor}`).join(", ");
  check("orders' outbox holds one audit event per committed change, with the actor", (await outbox(ordersDb)) === "order create by alice, order update by bob (support)");
  check("billing's outbox holds its own event", (await outbox(billingDb)) === "invoice create by system:billing");
  const total = await ordersDb.query("SELECT total FROM orders WHERE id = $1", [id]);
  check("mallory's change rolled back together with its audit event: total still 38.25, no event", total.rows[0].total === "38.25");
  await closeAll();
}

main();
