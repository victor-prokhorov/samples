import { db } from "./db.js";

await db.query(`
  DROP TABLE IF EXISTS uploads;
  -- The app keeps the metadata and the state machine; the bytes live in object storage.
  -- pending -> uploaded (the browser says it finished and HEAD agrees) -> clean | rejected (the scanner decides)
  CREATE TABLE uploads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id text NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    size bigint NOT NULL,
    key text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'clean', 'rejected')),
    verdict text,
    created_at timestamptz NOT NULL DEFAULT now(),
    uploaded_at timestamptz,
    scanned_at timestamptz
  );
  CREATE INDEX ON uploads (status, uploaded_at);
`);
console.log("uploads table ready");
await db.end();
