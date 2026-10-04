import { appDb as db } from "./db.js";

await db.query(`
  DROP TABLE IF EXISTS tenants, api_keys, buckets, members, request_log CASCADE;
  DROP FUNCTION IF EXISTS take_tokens;

  -- the policy: a sustained rate and a burst, per tenant and per API key
  CREATE TABLE tenants (id text PRIMARY KEY, name text NOT NULL, rate float8 NOT NULL, burst float8 NOT NULL);
  CREATE TABLE api_keys (key text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants, client text NOT NULL, rate float8 NOT NULL, burst float8 NOT NULL);
  INSERT INTO tenants VALUES ('acme', 'Acme', 50, 10), ('globex', 'Globex', 50, 10), ('initech', 'Initech', 50, 10);
  INSERT INTO api_keys VALUES
    ('acme-batch',     'acme',    'nightly batch export (ignores 429)', 30, 6),
    ('acme-sync',      'acme',    'HR sync (honours Retry-After)',      30, 6),
    ('globex-portal',  'globex',  'member portal',                      30, 6),
    ('initech-portal', 'initech', 'member portal',                      30, 6);

  CREATE TABLE members (id int PRIMARY KEY, tenant_id text NOT NULL, name text NOT NULL);
  INSERT INTO members SELECT i, (ARRAY['acme', 'globex', 'initech'])[1 + i % 3], 'Member ' || i FROM generate_series(1, 3000) i;

  -- bucket state: UNLOGGED (no WAL, emptied after a crash, which only means everyone starts with a full bucket)
  CREATE UNLOGGED TABLE buckets (key text PRIMARY KEY, tokens float8 NOT NULL, updated_at timestamptz NOT NULL);

  -- Token bucket, atomically, for several buckets at once (here the tenant's and the API key's).
  -- Lock the rows in key order (no deadlock between two requests), refill each by elapsed time x rate (capped at the
  -- burst), and take the cost from ALL of them or from NONE: a request refused by its key does not spend tenant tokens.
  -- wait[i] is how long until bucket i holds the cost again: the source of Retry-After.
  CREATE FUNCTION take_tokens(p_keys text[], p_burst float8[], p_rate float8[], p_cost float8 DEFAULT 1)
  RETURNS TABLE (allowed boolean, remaining float8[], wait float8[]) LANGUAGE plpgsql AS $$
  DECLARE
    now_ts timestamptz;
    t float8;
    ok boolean := true;
    toks float8[] := '{}';
    waits float8[] := '{}';
  BEGIN
    INSERT INTO buckets (key, tokens, updated_at)
    SELECT k, b, clock_timestamp() FROM unnest(p_keys, p_burst) AS u(k, b)
    ON CONFLICT (key) DO NOTHING;
    PERFORM 1 FROM buckets WHERE key = ANY (p_keys) ORDER BY key FOR UPDATE;
    now_ts := clock_timestamp();  -- read the clock only once the rows are ours
    FOR i IN 1 .. array_length(p_keys, 1) LOOP
      SELECT least(p_burst[i], b.tokens + extract(epoch FROM now_ts - b.updated_at) * p_rate[i]) INTO t
      FROM buckets b WHERE b.key = p_keys[i];
      toks := toks || t;
      waits := waits || greatest(0, (p_cost - t) / p_rate[i]);
      IF t < p_cost THEN ok := false; END IF;
    END LOOP;
    IF ok THEN
      toks := ARRAY(SELECT x - p_cost FROM unnest(toks) WITH ORDINALITY AS u(x, n) ORDER BY n);
    END IF;
    UPDATE buckets b SET tokens = u.t, updated_at = now_ts FROM unnest(p_keys, toks) AS u(k, t) WHERE b.key = u.k;
    RETURN QUERY SELECT ok, toks, waits;
  END $$;

  -- what the load generator saw, one row per request, for the proof queries
  CREATE TABLE request_log (run text NOT NULL, at_ms int NOT NULL, tenant text NOT NULL, client text NOT NULL, status int NOT NULL, ms float8 NOT NULL);
`);
console.log("setup: tenants (3), api_keys (4), members (3000), buckets, take_tokens(), request_log");
await db.end();
