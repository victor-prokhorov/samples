import { SERVICES, auditDb, closeAll, tx } from "./db.js";

const crashAfterSend = process.argv.includes("--crash-after-send");
// The simulated crash exits with its own code, so the run script can tell it from a real failure (exit code 1).
const CRASH_EXIT_CODE = 3;

type OutboxRow = { id: string; event_id: string; entity: string; entity_id: string; action: string; actor: string; reason: string; before: object | null; after: object | null; occurred_at: Date };

async function main() {
  for (const service of SERVICES) {
    for (;;) {
      const shipped = await tx(service.db, async (c) => {
        const { rows } = await c.query<OutboxRow>(
          "SELECT id, event_id, entity, entity_id, action, actor, reason, before, after, occurred_at FROM audit_outbox WHERE shipped_at IS NULL ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED",
        );
        for (const r of rows) {
          const inserted = await auditDb.query(
            "INSERT INTO audit_events (event_id, service, source_id, entity, entity_id, action, actor, reason, before, after, occurred_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (event_id) DO NOTHING",
            [r.event_id, service.name, r.id, r.entity, r.entity_id, r.action, r.actor, r.reason, r.before, r.after, r.occurred_at],
          );
          const outcome = inserted.rowCount ? "stored" : "DUPLICATE, already in the central log, skipped";
          console.log(`shipper: ${service.name} #${r.id} ${r.entity} ${r.entity_id} ${r.action} by ${r.actor} -> ${outcome}`);
        }
        if (crashAfterSend && rows.length) {
          console.log(`shipper: CRASH after sending the ${service.name} events, before marking them shipped`);
          process.exit(CRASH_EXIT_CODE);
        }
        if (rows.length) await c.query("UPDATE audit_outbox SET shipped_at = now() WHERE id = ANY($1)", [rows.map((r) => r.id)]);
        return rows.length;
      });
      if (!shipped) break;
      console.log(`shipper: ${service.name} marked ${shipped} shipped`);
    }
  }
  console.log("shipper: every outbox drained");
  await closeAll();
}

main();
