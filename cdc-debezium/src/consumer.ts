import { Kafka } from "kafkajs";
import { KAFKA_BROKER, TOPIC } from "./config.js";

type Row = Record<string, unknown>;

type ChangeEvent = {
  op: "c" | "u" | "d" | "r";
  before: Row | null;
  after: Row | null;
  source: { lsn: number; txId: number; table: string };
  ts_ms: number;
};

const OPS = { c: "INSERT", u: "UPDATE", d: "DELETE", r: "SNAPSHOT" };

async function main() {
  const kafka = new Kafka({ brokers: [KAFKA_BROKER] });
  const admin = kafka.admin();
  await admin.connect();
  if (!(await admin.listTopics()).includes(TOPIC)) await admin.createTopics({ topics: [{ topic: TOPIC }], waitForLeaders: true });
  await admin.disconnect();
  const consumer = kafka.consumer({ groupId: "orders-cdc-demo" });
  await consumer.connect();
  console.log(`consumer: subscribed to ${TOPIC}`);
  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const e: ChangeEvent = JSON.parse(message.value.toString());
      console.log(`consumer: ${OPS[e.op].padEnd(6)} lsn=${e.source.lsn} tx=${e.source.txId} before=${JSON.stringify(e.before)} after=${JSON.stringify(e.after)}`);
    },
  });
}

main();
