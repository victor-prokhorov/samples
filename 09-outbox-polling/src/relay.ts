import { Kafka, Partitioners } from "kafkajs";
import pg from "pg";
import { KAFKA_BROKER, PG_URL, TOPIC } from "./config.js";

const crashAfterSend = process.argv.includes("--crash-after-send");
// The simulated crash exits with its own code, so the run script can tell it from a real failure (exit code 1).
const CRASH_EXIT_CODE = 3;

type OutboxRow = { id: string; event_id: string; aggregate_id: string; type: string; payload: object };

async function main() {
  const db = new pg.Client(PG_URL);
  const producer = new Kafka({ brokers: [KAFKA_BROKER] }).producer({ createPartitioner: Partitioners.DefaultPartitioner });
  await Promise.all([db.connect(), producer.connect()]);
  for (;;) {
    await db.query("BEGIN");
    const { rows } = await db.query<OutboxRow>(
      "SELECT id, event_id, aggregate_id, type, payload FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED",
    );
    if (rows.length === 0) {
      await db.query("COMMIT");
      break;
    }
    await producer.send({
      topic: TOPIC,
      messages: rows.map((r) => ({ key: r.aggregate_id, value: JSON.stringify(r.payload), headers: { eventId: r.event_id, eventType: r.type } })),
    });
    console.log(`relay: claimed + sent ${rows.map((r) => `#${r.id} ${r.type}`).join(", ")}`);
    if (crashAfterSend) {
      console.log("relay: CRASH after send, before marking published (transaction never commits)");
      process.exit(CRASH_EXIT_CODE);
    }
    await db.query("UPDATE outbox SET published_at = now() WHERE id = ANY($1)", [rows.map((r) => r.id)]);
    await db.query("COMMIT");
    console.log(`relay: marked ${rows.length} published`);
  }
  console.log("relay: outbox drained");
  await Promise.all([db.end(), producer.disconnect()]);
}

main();
