import { Kafka } from "kafkajs";
import pg from "pg";
import { KAFKA_BROKER, PG_URL, TOPIC } from "./config.js";

async function main() {
  const client = new pg.Client(PG_URL);
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, customer TEXT NOT NULL, status TEXT NOT NULL, total NUMERIC(10, 2) NOT NULL);
    CREATE TABLE IF NOT EXISTS outbox (
      id BIGSERIAL PRIMARY KEY,
      event_id UUID NOT NULL UNIQUE,
      aggregate_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS outbox_unpublished ON outbox (id) WHERE published_at IS NULL`);
  await client.end();
  const admin = new Kafka({ brokers: [KAFKA_BROKER] }).admin();
  await admin.connect();
  if (!(await admin.listTopics()).includes(TOPIC)) await admin.createTopics({ topics: [{ topic: TOPIC }], waitForLeaders: true });
  await admin.disconnect();
  console.log(`setup: orders + outbox tables, topic ${TOPIC}`);
}

main();
