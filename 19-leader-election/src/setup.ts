import { db } from "./db.js";

async function main() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS leases (
      name TEXT PRIMARY KEY,
      holder TEXT NOT NULL,
      term INT NOT NULL,
      renewed_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticks (id BIGSERIAL PRIMARY KEY, holder TEXT NOT NULL, term INT, at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
    CREATE TABLE IF NOT EXISTS fenced_ticks (id BIGSERIAL PRIMARY KEY, holder TEXT NOT NULL, term INT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
    CREATE TABLE IF NOT EXISTS fence (resource TEXT PRIMARY KEY, max_term INT NOT NULL);
    INSERT INTO fence VALUES ('fenced_ticks', 0) ON CONFLICT DO NOTHING;
    CREATE OR REPLACE FUNCTION check_fencing_token() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      seen INT;
    BEGIN
      SELECT max_term INTO seen FROM fence WHERE resource = TG_TABLE_NAME FOR UPDATE;
      IF NEW.term < seen THEN
        RAISE EXCEPTION 'stale fencing token: term % < term % already seen', NEW.term, seen;
      END IF;
      UPDATE fence SET max_term = NEW.term WHERE resource = TG_TABLE_NAME;
      RETURN NEW;
    END $$;
    CREATE OR REPLACE TRIGGER fenced_ticks_check BEFORE INSERT ON fenced_ticks FOR EACH ROW EXECUTE FUNCTION check_fencing_token()`);
  console.log("setup: leases (one row per job), ticks (the job's output, unfenced), fenced_ticks (same, guarded by a fencing-token trigger)");
  await db.end();
}

main();
