import { adminDb, closeAll, inventoryDb, orchestratorDb, paymentsDb, shippingDb } from "./db.js";

async function main() {
  for (const name of ["inventory", "payments", "shipping", "orchestrator"]) {
    const { rowCount } = await adminDb.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!rowCount) await adminDb.query(`CREATE DATABASE ${name}`);
  }
  await inventoryDb.query(`
    CREATE TABLE IF NOT EXISTS stock (sku TEXT PRIMARY KEY, available INT NOT NULL CHECK (available >= 0));
    CREATE TABLE IF NOT EXISTS reservations (saga_id TEXT PRIMARY KEY, sku TEXT NOT NULL, qty INT NOT NULL);
    INSERT INTO stock VALUES ('keyboard', 10) ON CONFLICT DO NOTHING`);
  await paymentsDb.query("CREATE TABLE IF NOT EXISTS charges (saga_id TEXT PRIMARY KEY, amount NUMERIC(10, 2) NOT NULL, status TEXT NOT NULL)");
  await shippingDb.query("CREATE TABLE IF NOT EXISTS shipments (saga_id TEXT PRIMARY KEY, address TEXT NOT NULL)");
  await orchestratorDb.query(`
    CREATE TABLE IF NOT EXISTS sagas (
      id TEXT PRIMARY KEY,
      input JSONB NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('running', 'waiting', 'compensating', 'completed', 'aborted')),
      step INT NOT NULL,
      wake_at TIMESTAMPTZ,
      error TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  console.log("setup: 4 databases (inventory, payments, shipping, orchestrator), keyboard stock = 10");
  await closeAll();
}

main();
