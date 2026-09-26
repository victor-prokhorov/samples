import pg from "pg";
import { CONNECT_URL, PG_URL } from "./config.js";

const connector = {
  "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
  "plugin.name": "pgoutput",
  "database.hostname": "postgres",
  "database.port": "5432",
  "database.user": "postgres",
  "database.password": "postgres",
  "database.dbname": "postgres",
  "topic.prefix": "app",
  "table.include.list": "public.outbox",
  "tombstones.on.delete": "false",
  "key.converter": "org.apache.kafka.connect.storage.StringConverter",
  "value.converter": "org.apache.kafka.connect.json.JsonConverter",
  "value.converter.schemas.enable": "false",
  transforms: "outbox",
  "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
  "transforms.outbox.table.expand.json.payload": "true",
  "transforms.outbox.table.fields.additional.placement": "type:header:eventType",
};

async function main() {
  const client = new pg.Client(PG_URL);
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, customer TEXT NOT NULL, status TEXT NOT NULL, total NUMERIC(10, 2) NOT NULL);
    CREATE TABLE IF NOT EXISTS outbox (
      id UUID PRIMARY KEY,
      aggregatetype TEXT NOT NULL,
      aggregateid TEXT NOT NULL,
      type TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await client.end();
  const res = await fetch(`${CONNECT_URL}/connectors/outbox-connector/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(connector),
  });
  console.log("connector:", res.status, await res.text());
}

main();
