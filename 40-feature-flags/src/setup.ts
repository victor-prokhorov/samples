import { db } from "./db.js";
import { registry } from "./registry.js";

await db.query(`
  DROP TABLE IF EXISTS flags, flag_audit, exposures CASCADE;
  DROP FUNCTION IF EXISTS flags_touch, flags_audit;

  -- one row per flag; the evaluation rules live in code (flags.ts), the state lives here
  CREATE TABLE flags (
    key text PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('release', 'percentage', 'tenant', 'kill')),
    enabled boolean NOT NULL,
    percentage int NOT NULL DEFAULT 0 CHECK (percentage BETWEEN 0 AND 100),
    tenants text[] NOT NULL DEFAULT '{}',
    owner text NOT NULL,
    description text NOT NULL,
    expires_on date NOT NULL,
    version int NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  -- every change, who made it and why, with the row before and after
  CREATE TABLE flag_audit (
    id bigserial PRIMARY KEY,
    at timestamptz NOT NULL DEFAULT clock_timestamp(),
    flag_key text NOT NULL,
    action text NOT NULL,
    actor text NOT NULL,
    reason text,
    before jsonb,
    after jsonb
  );

  -- what each simulated member saw at each rollout step (for the chart and the proof)
  CREATE TABLE exposures (
    flag_key text NOT NULL,
    percentage int NOT NULL,
    member_id text NOT NULL,
    tenant text NOT NULL,
    stable boolean NOT NULL,   -- answer from the stable hash
    naive boolean NOT NULL,    -- answer from a fresh Math.random() per evaluation
    PRIMARY KEY (flag_key, percentage, member_id)
  );

  CREATE FUNCTION flags_touch() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
    RETURN NEW;
  END $$;
  CREATE TRIGGER flags_touch BEFORE UPDATE ON flags FOR EACH ROW EXECUTE FUNCTION flags_touch();

  -- the audit row and the cache invalidation are written by the database, so no code path can skip them
  CREATE FUNCTION flags_audit() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE
    actor text := nullif(current_setting('app.actor', true), '');
    k text := coalesce(NEW.key, OLD.key);
  BEGIN
    IF actor IS NULL THEN
      RAISE EXCEPTION 'flag change without app.actor: say who changes % and why', k;
    END IF;
    INSERT INTO flag_audit (flag_key, action, actor, reason, before, after)
    VALUES (k, lower(TG_OP), actor, nullif(current_setting('app.reason', true), ''),
            CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - 'description' - 'owner' END,
            CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - 'description' - 'owner' END);
    PERFORM pg_notify('flags_changed', k);
    RETURN NULL;
  END $$;
  CREATE TRIGGER flags_audit AFTER INSERT OR UPDATE OR DELETE ON flags FOR EACH ROW EXECUTE FUNCTION flags_audit();
`);

const c = await db.connect();
try {
  await c.query("BEGIN");
  await c.query("SELECT set_config('app.actor', 'setup', true), set_config('app.reason', 'seeded from src/registry.ts', true)");
  for (const f of registry) {
    await c.query(
      `INSERT INTO flags (key, kind, enabled, percentage, tenants, owner, description, expires_on) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [f.key, f.kind, f.enabled, f.percentage ?? 0, f.tenants ?? [], f.owner, f.description, f.expires],
    );
  }
  await c.query("COMMIT");
} finally {
  c.release();
}
console.log(`setup: flags, flag_audit, exposures; ${registry.length} flags seeded from src/registry.ts`);
await db.end();
