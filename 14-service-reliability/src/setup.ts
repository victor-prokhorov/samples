import { adminDb, closeAll, paymentsDb } from "./db.js";

async function main() {
  const { rowCount } = await adminDb.query("SELECT 1 FROM pg_database WHERE datname = 'payments'");
  if (!rowCount) await adminDb.query("CREATE DATABASE payments");
  await paymentsDb.query(`
    CREATE TABLE IF NOT EXISTS charges (
      id SERIAL PRIMARY KEY,
      customer TEXT NOT NULL,
      amount NUMERIC(10, 2) NOT NULL,
      idempotency_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      request_hash TEXT NOT NULL,
      response_status INT,
      response_body JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    )`);
  console.log("setup: database payments with charges and idempotency_keys (key is the primary key)");
  await closeAll();
}

main();
