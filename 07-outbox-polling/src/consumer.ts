import { Kafka } from "kafkajs";
import { KAFKA_BROKER, TOPIC } from "./config.js";

async function main() {
  const consumer = new Kafka({ brokers: [KAFKA_BROKER] }).consumer({ groupId: "order-events-demo" });
  const processed = new Set<string>();
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
  console.log(`consumer: subscribed to ${TOPIC}`);
  await consumer.run({
    eachMessage: async ({ message }) => {
      const eventId = message.headers?.eventId?.toString() ?? "";
      const eventType = message.headers?.eventType?.toString();
      if (processed.has(eventId)) return console.log(`consumer: DUPLICATE ${eventType} event_id=${eventId} skipped (idempotent consumer)`);
      processed.add(eventId);
      console.log(`consumer: ${eventType} key=${message.key?.toString()} event_id=${eventId} payload=${message.value?.toString()}`);
    },
  });
}

main();
