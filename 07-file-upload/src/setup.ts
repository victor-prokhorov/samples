import { db } from "./db.js";

await db.query(`
  CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size BIGINT,
    sha256 TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'complete')),
    version INT NOT NULL,
    content BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    changed_xid XID8 NOT NULL DEFAULT pg_current_xact_id()
  );
  CREATE INDEX IF NOT EXISTS files_changes ON files (owner, changed_xid, id);
  CREATE TABLE IF NOT EXISTS idempotency_keys (
    owner TEXT NOT NULL,
    key UUID NOT NULL,
    request_hash TEXT NOT NULL,
    response_status INT NOT NULL,
    response_headers JSONB NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (owner, key)
  )`);
console.log("setup: files (metadata, version for the ETag, content, changed_xid for the change feed) and idempotency_keys (primary key: owner + key)");
await db.end();
