import { Kafka } from "kafkajs";
import { check } from "./check.js";
import { KAFKA_BROKER, TOPIC } from "./config.js";

// With --messages N the consumer stops after N change events and checks what arrived.
const flag = process.argv.indexOf("--messages");
const expected = flag > 0 ? Number(process.argv[flag + 1]) : Infinity;

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
  const events: ChangeEvent[] = [];
  let done = () => {};
  const finished = new Promise<void>((resolve) => (done = resolve));
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const e: ChangeEvent = JSON.parse(message.value.toString());
      console.log(`consumer: ${OPS[e.op].padEnd(6)} lsn=${e.source.lsn} tx=${e.source.txId} before=${JSON.stringify(e.before)} after=${JSON.stringify(e.after)}`);
      events.push(e);
      if (events.length >= expected) done();
    },
  });
  if (expected === Infinity) return;
  await finished;
  await consumer.disconnect();
  const tx = events.map((e) => e.source.txId);
  check("five committed changes arrive in order: INSERT, UPDATE, UPDATE, INSERT, DELETE", events.map((e) => OPS[e.op]).join() === "INSERT,UPDATE,UPDATE,INSERT,DELETE");
  check("the two changes committed together share one tx id; every other change has its own", tx[2] === tx[3] && new Set(tx).size === 4);
  check("no event deletes bob: the rolled-back DELETE never reached Kafka", !events.some((e) => e.op === "d" && e.before?.customer === "bob"));
  check("the DELETE carries the full before row (REPLICA IDENTITY FULL)", events[4]?.before?.customer === "alice" && events[4]?.before?.status === "shipped" && events[4]?.after === null);
  check("LSNs strictly increase", events.every((e, i) => i === 0 || e.source.lsn > events[i - 1].source.lsn));
}

main();
