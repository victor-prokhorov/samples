import { Consumer, EachMessagePayload, Kafka, KafkaMessage, Partitioners, Producer, logLevel } from "kafkajs";
import pg from "pg";
import { tx } from "./db.js";

export type Order = { sku: string; qty: number; amount: string; address: string };

export type SagaEvent = { eventId: string; type: string; orderId: string; order: Order; topic: string; partition: number; offset: string };

export type Handler = (c: pg.PoolClient, e: SagaEvent) => Promise<{ effect: string; emit?: string }>;

export type Service = { name: string; topic: string; db: pg.Pool; emits: string[]; on: Record<string, Handler> };

type OutboxRow = { id: string; event_id: string; order_id: string; type: string; causation_id: string | null; payload: Order };

export const BROKER = "localhost:59095";

// The simulated crash exits with its own code, so the run script can tell it from a failed check (exit code 1).
export const CRASH_EXIT_CODE = 3;

export const kafka = new Kafka({ brokers: [BROKER], logLevel: logLevel.ERROR });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isOrder(v: unknown): v is Order {
  return typeof v === "object" && v !== null && "sku" in v && typeof v.sku === "string" && "qty" in v && typeof v.qty === "number" && "amount" in v && typeof v.amount === "string" && "address" in v && typeof v.address === "string";
}

function parse(topic: string, partition: number, m: KafkaMessage): SagaEvent | null {
  const eventId = m.headers?.eventId?.toString();
  const type = m.headers?.eventType?.toString();
  const orderId = m.key?.toString();
  const order: unknown = JSON.parse(m.value?.toString() ?? "null");
  if (!eventId || !type || !orderId || !isOrder(order)) return null;
  return { eventId, type, orderId, order, topic, partition, offset: m.offset };
}

export function topicOf(services: Service[], type: string) {
  const owner = services.find((s) => s.emits.includes(type));
  if (!owner) throw new Error(`nobody publishes ${type}`);
  return owner.topic;
}

export function listensTo(services: Service[], s: Service) {
  return [...new Set(Object.keys(s.on).map((type) => topicOf(services, type)))];
}

async function handle(s: Service, p: EachMessagePayload, crashAt?: string) {
  const e = parse(p.topic, p.partition, p.message);
  const handler = e && s.on[e.type];
  if (!e || !handler) return;
  const line = await tx(s.db, async (c) => {
    const fresh = await c.query("INSERT INTO processed_messages (event_id, type, order_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [e.eventId, e.type, e.orderId]);
    if (!fresh.rowCount) return `DUPLICATE event_id=${e.eventId.slice(0, 8)} already in processed_messages, skipped`;
    const r = await handler(c, e);
    if (!r.emit) return r.effect;
    await c.query("INSERT INTO outbox (order_id, type, causation_id, payload) VALUES ($1, $2, $3, $4)", [e.orderId, r.emit, e.eventId, e.order]);
    return `${r.effect}, outbox <- ${r.emit}`;
  });
  console.log(`   [${s.name}] <- ${e.type} ${e.orderId} (${e.topic} p${e.partition} @${e.offset}): ${line}`);
  if (crashAt === `${s.name}:${e.type}:${e.orderId}`) {
    console.log(`   [${s.name}] CRASH after the transaction committed, before Kafka got the offset of ${e.type} ${e.orderId}`);
    process.exit(CRASH_EXIT_CODE);
  }
}

async function relayOnce(s: Service, producer: Producer) {
  return tx(s.db, async (c) => {
    const { rows } = await c.query<OutboxRow>(
      "SELECT id, event_id, order_id, type, causation_id, payload FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED",
    );
    if (!rows.length) return 0;
    await producer.send({
      topic: s.topic,
      messages: rows.map((r) => ({ key: r.order_id, value: JSON.stringify(r.payload), headers: { eventId: r.event_id, eventType: r.type, causationId: r.causation_id ?? "" } })),
    });
    await c.query("UPDATE outbox SET published_at = now() WHERE id = ANY($1)", [rows.map((r) => r.id)]);
    return rows.length;
  });
}

export async function startServices(services: Service[], crashAt?: string) {
  let running = true;
  const consumers = new Map<string, Consumer>();
  const relays: Promise<void>[] = [];
  const producers: Producer[] = [];
  await Promise.all(
    services.map(async (s) => {
      const consumer = kafka.consumer({ groupId: s.name, sessionTimeout: 6000, heartbeatInterval: 1000, maxWaitTimeInMs: 250 });
      const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
      await Promise.all([consumer.connect(), producer.connect()]);
      const joined = new Promise<void>((resolve) => consumer.on(consumer.events.GROUP_JOIN, () => resolve()));
      await consumer.subscribe({ topics: listensTo(services, s), fromBeginning: true });
      await consumer.run({ eachMessage: (p) => handle(s, p, crashAt) });
      await joined;
      consumers.set(s.name, consumer);
      producers.push(producer);
      relays.push(
        (async () => {
          while (running) if (!(await relayOnce(s, producer))) await sleep(100);
        })(),
      );
    }),
  );
  const consumer = (name: string) => {
    const c = consumers.get(name);
    if (!c) throw new Error(`no service ${name}`);
    return c;
  };
  return {
    pause: (name: string, topic: string) => consumer(name).pause([{ topic }]),
    resume: (name: string, topic: string) => consumer(name).resume([{ topic }]),
    stop: async () => {
      running = false;
      await Promise.all(relays);
      await Promise.all([...[...consumers.values()].map((c) => c.disconnect()), ...producers.map((p) => p.disconnect())]);
    },
  };
}

export async function settle(services: Service[]) {
  let last = "";
  let quiet = 0;
  while (quiet < 6) {
    await sleep(250);
    const counts = await Promise.all(
      services.map((s) => s.db.query<{ unpublished: string; processed: string }>("SELECT (SELECT count(*) FROM outbox WHERE published_at IS NULL) AS unpublished, (SELECT count(*) FROM processed_messages) AS processed")),
    );
    const snapshot = JSON.stringify(counts.map((r) => r.rows[0]));
    const drained = counts.every((r) => r.rows[0].unpublished === "0");
    quiet = drained && snapshot === last ? quiet + 1 : 0;
    last = snapshot;
  }
}
