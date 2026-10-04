import { db } from "./db.js";

await db.query(`
  DROP TABLE IF EXISTS members, employers, source_links, quarantine, sync_marks, sync_runs, webhook_inbox, webhook_refusals, reconciliation_runs, naive_members;

  -- the domain's tables: domain names, domain values, domain constraints
  CREATE TABLE employers (
    ref text PRIMARY KEY,
    name text NOT NULL,
    sector text NOT NULL CHECK (sector IN ('manufacturing', 'services', 'retail'))
  );
  CREATE TABLE members (
    member_no text PRIMARY KEY CHECK (member_no ~ '^M[0-9]{4}$'),
    given_name text NOT NULL,
    family_name text NOT NULL,
    email text NOT NULL CHECK (email LIKE '%_@_%._%'),
    birth_date date NOT NULL,
    status text NOT NULL CHECK (status IN ('active', 'deferred', 'retired')),
    employer_ref text NOT NULL REFERENCES employers
  );

  -- the integration's bookkeeping, beside the domain and never inside it
  CREATE TABLE source_links (
    entity text NOT NULL,
    source_id text NOT NULL,           -- the CRM's GUID, opaque here
    local_key text NOT NULL,           -- member_no or employer ref
    version bigint NOT NULL,           -- the CRM's VersionNumber: changes only move forward
    changed_at timestamptz NOT NULL,   -- the CRM's ModifiedOn
    PRIMARY KEY (entity, source_id)
  );
  CREATE TABLE quarantine (
    entity text NOT NULL,
    source_id text NOT NULL,
    version bigint NOT NULL,
    reasons text[] NOT NULL,
    raw jsonb NOT NULL,
    seen_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (entity, source_id)
  );
  CREATE TABLE sync_marks (stream text PRIMARY KEY, mark timestamptz, updated_at timestamptz NOT NULL);
  CREATE TABLE sync_runs (
    id serial PRIMARY KEY,
    stream text NOT NULL,
    at timestamptz NOT NULL DEFAULT now(),
    mark_before timestamptz,
    mark_after timestamptz,
    fetched int NOT NULL, applied int NOT NULL, unchanged int NOT NULL, removed int NOT NULL, rejected int NOT NULL
  );
  CREATE TABLE webhook_inbox (
    event_id text PRIMARY KEY,         -- from the signed body: the idempotency key
    source_id text NOT NULL,
    signed_at timestamptz NOT NULL,
    first_seen timestamptz NOT NULL DEFAULT now(),
    deliveries int NOT NULL DEFAULT 1,
    outcome text,                      -- NULL until processed
    processed_at timestamptz
  );
  CREATE TABLE webhook_refusals (id serial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL, event_id text);
  CREATE TABLE reconciliation_runs (
    id serial PRIMARY KEY,
    at timestamptz NOT NULL DEFAULT now(),
    source_active int NOT NULL, source_valid int NOT NULL, quarantined int NOT NULL, local_count int NOT NULL,
    source_checksum text NOT NULL, local_checksum text NOT NULL,
    missing_locally int NOT NULL, extra_locally int NOT NULL, differing int NOT NULL,
    report jsonb NOT NULL
  );

  -- the leaky version: CRM values copied as they come
  CREATE TABLE naive_members (contact_id text, member_no text, name text, email text, birth_date text, status text, employer text);
`);
console.log("setup: employers, members (domain); source_links, quarantine, sync_marks, sync_runs, webhook_inbox, webhook_refusals, reconciliation_runs (integration); naive_members");
await db.end();
