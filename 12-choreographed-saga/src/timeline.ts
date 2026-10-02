import { closeAll, ordersDb } from "./db.js";
import { SERVICES } from "./services.js";

type Row = { service: string; event_id: string; type: string; causation_id: string | null; created_at: Date };

async function timeline(orderId: string) {
  const published = await Promise.all(
    SERVICES.map((s) => s.db.query<Row>("SELECT $2::text AS service, event_id, type, causation_id, created_at FROM outbox WHERE order_id = $1", [orderId, s.name])),
  );
  const consumed = await Promise.all(SERVICES.map((s) => s.db.query<{ event_id: string }>("SELECT event_id FROM processed_messages WHERE order_id = $1", [orderId])));
  const events = published.flatMap((r) => r.rows).sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  const status = await ordersDb.query<{ status: string }>("SELECT status FROM orders WHERE id = $1", [orderId]);
  console.log(`   ${orderId} (the orders table only says: ${status.rows[0].status})`);
  for (const e of events) {
    const cause = events.find((x) => x.event_id === e.causation_id);
    const by = SERVICES.filter((s, i) => consumed[i].rows.some((r) => r.event_id === e.event_id)).map((s) => s.name);
    const ms = String(e.created_at.getTime() - events[0].created_at.getTime()).padStart(5);
    console.log(`   +${ms}ms ${e.service.padEnd(9)} ${e.type.padEnd(17)} ${(cause ? `after ${cause.service} ${cause.type}` : "after the HTTP call").padEnd(34)} processed by ${by.join(", ") || "nobody"}`);
  }
}

async function main() {
  console.log("\n## 8. Where is the saga state? Rebuild it by correlation id");
  console.log("   concept: no service holds the whole saga; the order id is the correlation id (Kafka key and outbox order_id), and each event names the event that caused it (causation_id). Joining four outboxes and four processed_messages tables rebuilds what 06's saga log holds in one row");
  for (const id of process.argv.slice(2)) await timeline(id);
  await closeAll();
}

main();
