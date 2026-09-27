import { SERVICES, adminDb, auditDb, billingDb, closeAll, ordersDb } from "./db.js";

const OUTBOX = `
  CREATE TABLE IF NOT EXISTS audit_outbox (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    reason TEXT NOT NULL,
    before JSONB,
    after JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    shipped_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS audit_outbox_unshipped ON audit_outbox (id) WHERE shipped_at IS NULL`;

async function main() {
  for (const name of [...SERVICES.map((s) => s.name), "audit"]) {
    const { rowCount } = await adminDb.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!rowCount) await adminDb.query(`CREATE DATABASE ${name}`);
  }
  await ordersDb.query(`CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, customer TEXT NOT NULL, total NUMERIC(10, 2) NOT NULL); ${OUTBOX}`);
  await billingDb.query(`CREATE TABLE IF NOT EXISTS invoices (id SERIAL PRIMARY KEY, order_id INT NOT NULL, amount NUMERIC(10, 2) NOT NULL); ${OUTBOX}`);
  await auditDb.query(`
    CREATE TABLE IF NOT EXISTS audit_events (
      event_id UUID PRIMARY KEY,
      service TEXT NOT NULL,
      source_id BIGINT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      reason TEXT NOT NULL,
      before JSONB,
      after JSONB,
      occurred_at TIMESTAMPTZ NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE OR REPLACE FUNCTION reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'audit_events is append-only: % rejected', TG_OP;
    END $$;
    CREATE OR REPLACE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_events EXECUTE FUNCTION reject_change()`);
  console.log("setup: databases orders and billing (each with its own audit_outbox), audit (central, append-only audit_events)");
  await closeAll();
}

main();
