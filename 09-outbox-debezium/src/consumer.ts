import { Kafka } from "kafkajs";
import { KAFKA_BROKER, TOPIC } from "./config.js";

async function main() {
  const kafka = new Kafka({ brokers: [KAFKA_BROKER] });
  const admin = kafka.admin();
  await admin.connect();
  if (!(await admin.listTopics()).includes(TOPIC)) await admin.createTopics({ topics: [{ topic: TOPIC }], waitForLeaders: true });
  await admin.disconnect();
  const consumer = kafka.consumer({ groupId: "order-events-demo" });
  const seen = new Set<string>();
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
  console.log(`consumer: subscribed to ${TOPIC}`);
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const eventId = message.headers?.id?.toString();
      if (!eventId) return console.log(`consumer: message at offset ${message.offset} has no id header, skipped`);
      if (seen.has(eventId)) return console.log(`consumer: duplicate ${eventId} skipped`);
      seen.add(eventId);
      console.log(
        `consumer: ${topic}[${partition}] key=${message.key?.toString()} eventType=${message.headers?.eventType?.toString()} id=${eventId} payload=${message.value?.toString()}`,
      );
    },
  });
}

main();
