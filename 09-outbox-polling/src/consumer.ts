import { Kafka } from "kafkajs";
import pg from "pg";
import { check } from "./check.js";
import { KAFKA_BROKER, PG_URL, TOPIC } from "./config.js";

// With --messages N the consumer stops after N deliveries and checks them against the outbox.
const flag = process.argv.indexOf("--messages");
const expected = flag > 0 ? Number(process.argv[flag + 1]) : Infinity;

async function main() {
  const consumer = new Kafka({ brokers: [KAFKA_BROKER] }).consumer({ groupId: "order-events-demo" });
  const processed = new Set<string>();
  const handled = new Map<string, number>();
  let received = 0;
  let done = () => {};
  const finished = new Promise<void>((resolve) => (done = resolve));
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
  console.log(`consumer: subscribed to ${TOPIC}`);
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (++received >= expected) done();
      const eventId = message.headers?.eventId?.toString();
      if (!eventId) return console.log(`consumer: message at offset ${message.offset} has no eventId header, skipped`);
      const eventType = message.headers?.eventType?.toString();
      if (processed.has(eventId)) return console.log(`consumer: DUPLICATE ${eventType} event_id=${eventId} skipped (idempotent consumer)`);
      processed.add(eventId);
      handled.set(eventId, (handled.get(eventId) ?? 0) + 1);
      console.log(`consumer: ${eventType} key=${message.key?.toString()} event_id=${eventId} payload=${message.value?.toString()}`);
    },
  });
  if (expected === Infinity) return;
  await finished;
  await consumer.disconnect();
  const db = new pg.Client(PG_URL);
  await db.connect();
  const { rows } = await db.query("SELECT event_id FROM outbox ORDER BY id");
  await db.end();
  const ids = rows.map((r) => r.event_id as string);
  console.log(`consumer: ${received} deliveries, ${handled.size} events processed`);
  check("every outbox event reached the consumer and was processed exactly once", handled.size === ids.length && ids.every((id) => handled.get(id) === 1));
  check(`the ${received - ids.length} re-sent copies from the crashed relay pass were skipped as duplicates`, received === ids.length * 2);
}

main();
