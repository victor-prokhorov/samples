import { Kafka, logLevel } from "kafkajs";
import { BROKER } from "./bus.js";
import { adminDb, closeAll } from "./db.js";
import { SERVICES } from "./services.js";

const OUTBOX = `
  CREATE TABLE IF NOT EXISTS outbox (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    type TEXT NOT NULL,
    causation_id UUID,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    published_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS outbox_unpublished ON outbox (id) WHERE published_at IS NULL;
  CREATE TABLE IF NOT EXISTS processed_messages (
    event_id UUID PRIMARY KEY,
    type TEXT NOT NULL,
    order_id TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
  )`;

const TABLES: Record<string, string> = {
  orders: "CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  inventory: `
    CREATE TABLE IF NOT EXISTS stock (sku TEXT PRIMARY KEY, available INT NOT NULL CHECK (available >= 0));
    CREATE TABLE IF NOT EXISTS reservations (order_id TEXT PRIMARY KEY, sku TEXT NOT NULL, qty INT NOT NULL);
    INSERT INTO stock VALUES ('keyboard', 10) ON CONFLICT DO NOTHING`,
  payments: "CREATE TABLE IF NOT EXISTS charges (order_id TEXT PRIMARY KEY, amount NUMERIC(10, 2) NOT NULL, status TEXT NOT NULL)",
  shipping: "CREATE TABLE IF NOT EXISTS shipments (order_id TEXT PRIMARY KEY, address TEXT NOT NULL)",
};

async function main() {
  for (const s of SERVICES) {
    const { rowCount } = await adminDb.query("SELECT 1 FROM pg_database WHERE datname = $1", [s.name]);
    if (!rowCount) await adminDb.query(`CREATE DATABASE ${s.name}`);
    await s.db.query(`${TABLES[s.name]}; ${OUTBOX}`);
  }
  const admin = new Kafka({ brokers: [BROKER], logLevel: logLevel.NOTHING }).admin();
  await admin.connect();
  const existing = await admin.listTopics();
  const topics = SERVICES.map((s) => s.topic).filter((t) => !existing.includes(t));
  await admin.createTopics({ topics: topics.map((topic) => ({ topic, numPartitions: 3 })), waitForLeaders: true });
  await admin.describeGroups(SERVICES.map((s) => s.name));
  await admin.disconnect();
  console.log(`setup: 4 databases (${SERVICES.map((s) => s.name).join(", ")}), each with its own outbox and processed_messages; topics ${SERVICES.map((s) => s.topic).join(", ")} (3 partitions each); keyboard stock = 10`);
  await closeAll();
}

main();
