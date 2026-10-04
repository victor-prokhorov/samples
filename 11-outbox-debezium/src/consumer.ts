import { Kafka } from "kafkajs";
import { check } from "./check.js";
import { KAFKA_BROKER, TOPIC } from "./config.js";

// With --messages N the consumer stops 3s after the Nth event (to catch any unexpected extra one) and checks them.
const flag = process.argv.indexOf("--messages");
const expected = flag > 0 ? Number(process.argv[flag + 1]) : Infinity;

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
  const events: { topic: string; key: string; type: string; payload: Record<string, unknown> }[] = [];
  let done = () => {};
  const finished = new Promise<void>((resolve) => (done = resolve));
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const eventId = message.headers?.id?.toString();
      if (!eventId) return console.log(`consumer: message at offset ${message.offset} has no id header, skipped`);
      if (seen.has(eventId)) return console.log(`consumer: duplicate ${eventId} skipped`);
      seen.add(eventId);
      console.log(
        `consumer: ${topic}[${partition}] key=${message.key?.toString()} eventType=${message.headers?.eventType?.toString()} id=${eventId} payload=${message.value?.toString()}`,
      );
      events.push({ topic, key: message.key?.toString() ?? "", type: message.headers?.eventType?.toString() ?? "", payload: JSON.parse(message.value?.toString() ?? "{}") });
      if (events.length === expected) setTimeout(done, 3000);
    },
  });
  if (expected === Infinity) return;
  await finished;
  await consumer.disconnect();
  check("exactly three events arrived, in order: OrderPlaced, OrderPaid, OrderShipped", events.map((e) => e.type).join() === "OrderPlaced,OrderPaid,OrderShipped");
  check("all three are keyed by alice's order id, on the routed topic outbox.event.order", events.every((e) => e.key === "1" && e.topic === TOPIC && e.topic === "outbox.event.order"));
  check("nothing for bob (rolled back) or carol (dual write lost)", !events.some((e) => e.payload.customer === "bob" || e.payload.customer === "carol" || e.key !== "1"));
}

main();
