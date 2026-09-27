import { SERVICES, auditDb, closeAll } from "./db.js";

const crashAfterSend = process.argv.includes("--crash-after-send");

type OutboxRow = { id: string; event_id: string; entity: string; entity_id: string; action: string; actor: string; before: object | null; after: object | null; occurred_at: Date };

async function main() {
  for (const service of SERVICES) {
    const client = await service.db.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<OutboxRow>("SELECT * FROM audit_outbox WHERE shipped_at IS NULL ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED");
      for (const r of rows) {
        const inserted = await auditDb.query(
          "INSERT INTO audit_events (event_id, service, entity, entity_id, action, actor, before, after, occurred_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (event_id) DO NOTHING",
          [r.event_id, service.name, r.entity, r.entity_id, r.action, r.actor, r.before, r.after, r.occurred_at],
        );
        const outcome = inserted.rowCount ? "stored" : "DUPLICATE, already in the central log, skipped";
        console.log(`shipper: ${service.name} #${r.id} ${r.entity} ${r.entity_id} ${r.action} by ${r.actor} -> ${outcome}`);
      }
      if (crashAfterSend && rows.length) {
        console.log(`shipper: CRASH after sending the ${service.name} events, before marking them shipped`);
        process.exit(1);
      }
      await client.query("UPDATE audit_outbox SET shipped_at = now() WHERE id = ANY($1)", [rows.map((r) => r.id)]);
      await client.query("COMMIT");
      console.log(`shipper: ${service.name} marked ${rows.length} shipped`);
    } finally {
      client.release();
    }
  }
  await closeAll();
}

main();
