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
  "table.include.list": "public.orders",
  "publication.autocreate.mode": "filtered",
  "tombstones.on.delete": "false",
  "decimal.handling.mode": "string",
  "key.converter": "org.apache.kafka.connect.json.JsonConverter",
  "key.converter.schemas.enable": "false",
  "value.converter": "org.apache.kafka.connect.json.JsonConverter",
  "value.converter.schemas.enable": "false",
};

async function main() {
  const client = new pg.Client(PG_URL);
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, customer TEXT NOT NULL, status TEXT NOT NULL, total NUMERIC(10, 2) NOT NULL);
    ALTER TABLE orders REPLICA IDENTITY FULL`);
  await client.end();
  const res = await fetch(`${CONNECT_URL}/connectors/orders-connector/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(connector),
  });
  console.log("connector:", res.status, await res.text());
}

main();
