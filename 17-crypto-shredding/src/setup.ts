import { newKey } from "./crypto.js";
import { closeAll, db } from "./db.js";

async function main() {
  for (const name of ["events", "keys", "kms"]) {
    const { rowCount } = await db("postgres").query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!rowCount) await db("postgres").query(`CREATE DATABASE ${name}`);
  }
  await db("events").query(`
    CREATE TABLE IF NOT EXISTS events (
      id BIGSERIAL PRIMARY KEY,
      subject_id UUID NOT NULL,
      type TEXT NOT NULL,
      data JSONB NOT NULL,
      pii JSONB NOT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );
    CREATE OR REPLACE FUNCTION reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'events is append-only: % rejected', TG_OP;
    END $$;
    CREATE OR REPLACE TRIGGER events_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON events EXECUTE FUNCTION reject_change()`);
  await db("keys").query(`
    CREATE TABLE IF NOT EXISTS subject_keys (
      subject_id UUID PRIMARY KEY,
      wrapped_dek TEXT NOT NULL,
      kek_id INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS subject_lookup (
      email_hash BYTEA PRIMARY KEY,
      subject_id UUID NOT NULL REFERENCES subject_keys ON DELETE CASCADE
    )`);
  await db("kms").query("CREATE TABLE IF NOT EXISTS kms_keys (purpose TEXT NOT NULL, version INT NOT NULL, key BYTEA NOT NULL, PRIMARY KEY (purpose, version))");
  const { rowCount } = await db("kms").query("SELECT 1 FROM kms_keys");
  if (!rowCount) await db("kms").query("INSERT INTO kms_keys (purpose, version, key) VALUES ('kek', 1, $1), ('blind-index', 1, $2)", [newKey(), newKey()]);
  console.log("setup: databases events (append-only events), keys (per-subject wrapped DEKs, email blind index), kms (KEK 1, blind-index key)");
  await closeAll();
}

main();
