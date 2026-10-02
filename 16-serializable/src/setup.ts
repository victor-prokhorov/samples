import { db } from "./db.js";

async function main() {
  await db.query(`
    DROP TABLE IF EXISTS tickets, events, products;
    CREATE TABLE products (id TEXT PRIMARY KEY, stock INT NOT NULL);
    CREATE TABLE events (id TEXT PRIMARY KEY, capacity INT NOT NULL);
    CREATE TABLE tickets (
      id BIGSERIAL PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events,
      seat TEXT,
      buyer TEXT NOT NULL,
      UNIQUE (event_id, seat)
    );
    CREATE INDEX ON tickets (event_id)`);
  console.log("setup: products (stock counter), events (capacity), tickets (UNIQUE (event_id, seat))");
  await db.end();
}

main();
