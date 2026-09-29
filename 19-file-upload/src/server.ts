import { createHash, randomUUID } from "node:crypto";
import express, { NextFunction, Request, Response } from "express";
import { PORT, db, tx } from "./db.js";

// A real service validates a JWT or looks the token up; the sample maps two static tokens to two owners.
const TOKENS = new Map([
  ["token-alice", "alice"],
  ["token-bob", "bob"],
]);

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_LIMIT = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = {
  id: string;
  name: string;
  content_type: string;
  size: string | null;
  sha256: string | null;
  status: "pending" | "complete";
  version: number;
  created_at: Date;
  updated_at: Date;
  changed_xid: string;
};

type FileMeta = { name: string; content_type: string; size?: number };

const COLUMNS = "id, name, content_type, size, sha256, status, version, created_at, updated_at, changed_xid";

const etag = (version: number) => `"${version}"`;

function toFile(r: Row) {
  return {
    fileId: r.id,
    name: r.name,
    content_type: r.content_type,
    size: r.size === null ? null : Number(r.size),
    sha256: r.sha256,
    status: r.status,
    version: r.version,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

function problem(res: Response, status: number, detail: string) {
  res.status(status).type("application/problem+json").json({ status, detail });
}

function isFileMeta(v: unknown): v is FileMeta {
  if (typeof v !== "object" || v === null) return false;
  if (!("name" in v) || typeof v.name !== "string" || !v.name.trim()) return false;
  if (!("content_type" in v) || typeof v.content_type !== "string" || !v.content_type.includes("/")) return false;
  if ("size" in v && v.size !== undefined && !(Number.isSafeInteger(v.size) && typeof v.size === "number" && v.size >= 0 && v.size <= MAX_BYTES)) return false;
  return true;
}

// Entity tags from If-Match / If-None-Match: `*`, or a comma-separated list of `"x"` and `W/"x"`.
function parseTags(header: string) {
  if (header.trim() === "*") return "*";
  return header.split(",").map((t) => t.trim()).filter(Boolean);
}

// If-Match uses the strong comparison: a weak tag never matches (RFC 9110 13.1.1).
function ifMatch(header: string, current: string) {
  const tags = parseTags(header);
  return tags === "*" || tags.includes(current);
}

// If-None-Match uses the weak comparison: W/"1" matches "1" (RFC 9110 13.1.2).
function ifNoneMatch(header: string, current: string) {
  const tags = parseTags(header);
  return tags === "*" || tags.some((t) => t.replace(/^W\//, "") === current);
}

// One range only: `bytes=a-b`, `bytes=a-` or `bytes=-n`. Anything else is ignored and the whole content is sent, which RFC 9110 allows.
function parseRange(header: string, size: number): { start: number; end: number } | "unsatisfiable" | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (m[2] !== "" && Number(m[2]) < start) return null;
  if (start >= size) return "unsatisfiable";
  return { start, end };
}

// The cursor is opaque to clients: base64url of the last row's (changed_xid, id). It is also a sync token: keep it and poll again later.
function encodeCursor(xid: string, id: string) {
  return Buffer.from(JSON.stringify([xid, id])).toString("base64url");
}

function decodeCursor(s: string): [string, string] | null {
  try {
    const v: unknown = JSON.parse(Buffer.from(s, "base64url").toString());
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && /^\d+$/.test(v[0]) && typeof v[1] === "string" && UUID.test(v[1])) return [v[0], v[1]];
  } catch {}
  return null;
}

const app = express();
app.disable("x-powered-by");
// Express sets a weak ETag on every res.json by default; this API sets its own strong version tags.
app.set("etag", false);

app.use("/v1", (req: Request, res: Response, next: NextFunction) => {
  const m = /^Bearer (\S+)$/.exec(req.get("authorization") ?? "");
  const owner = m && TOKENS.get(m[1]);
  if (!owner) {
    res.set("WWW-Authenticate", 'Bearer realm="files"');
    return problem(res, 401, "missing or invalid bearer token");
  }
  res.locals.owner = owner;
  next();
});

// POST /v1/files: create the metadata, answer with where to upload. Idempotency-Key makes a retry return the same file.
app.post("/v1/files", express.json(), async (req, res) => {
  const owner: string = res.locals.owner;
  const key = req.get("idempotency-key") ?? "";
  if (!UUID.test(key)) return problem(res, 400, "Idempotency-Key header must be a UUID");
  if (!isFileMeta(req.body)) return problem(res, 400, `body must be {name, content_type, size?}, size at most ${MAX_BYTES} bytes`);
  const meta = { name: req.body.name, content_type: req.body.content_type, size: req.body.size ?? null };
  const hash = createHash("sha256").update(JSON.stringify(meta)).digest("hex");
  const id = randomUUID();
  const body = { fileId: id, status: "pending", upload_file_url: `${req.protocol}://${req.get("host")}/v1/files/${id}/content` };
  const headers = { ETag: etag(1), Location: `/v1/files/${id}` };

  const outcome = await tx(async (c) => {
    // The claim and the file commit together. A concurrent duplicate blocks on the primary key until this commits, then replays.
    const claimed = await c.query(
      `INSERT INTO idempotency_keys (owner, key, request_hash, response_status, response_headers, response_body)
       VALUES ($1, $2, $3, 201, $4, $5) ON CONFLICT (owner, key) DO NOTHING`,
      [owner, key, hash, headers, body],
    );
    if (claimed.rowCount === 1) {
      await c.query("INSERT INTO files (id, owner, name, content_type, size, status, version) VALUES ($1, $2, $3, $4, $5, 'pending', 1)", [id, owner, meta.name, meta.content_type, meta.size]);
      return { replayed: false, status: 201, headers, body };
    }
    const { rows } = await c.query("SELECT request_hash, response_status, response_headers, response_body FROM idempotency_keys WHERE owner = $1 AND key = $2", [owner, key]);
    if (rows[0].request_hash !== hash) return null;
    return { replayed: true, status: rows[0].response_status, headers: rows[0].response_headers, body: rows[0].response_body };
  });
  if (!outcome) return problem(res, 422, "this Idempotency-Key was already used with a different body");
  if (outcome.replayed) res.set("Idempotent-Replayed", "true");
  res.status(outcome.status).set(outcome.headers).json(outcome.body);
});

// PUT /v1/files/:id/content: optimistic concurrency. If-Match is required, and the version check is part of the UPDATE, so two writers holding the same ETag cannot both win.
app.put("/v1/files/:id/content", express.raw({ type: () => true, limit: MAX_BYTES }), async (req, res) => {
  const owner: string = res.locals.owner;
  const id = String(req.params.id);
  if (!UUID.test(id)) return problem(res, 404, "no such file");
  if (!req.is("application/octet-stream")) return problem(res, 415, "Content-Type must be application/octet-stream");
  const match = req.get("if-match");
  if (!match) return problem(res, 428, "If-Match is required: send the ETag you last saw");
  const content: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  const { rows } = await db.query<Row>(`SELECT ${COLUMNS} FROM files WHERE id = $1 AND owner = $2`, [id, owner]);
  const file = rows[0];
  if (!file) return problem(res, 404, "no such file");
  if (!ifMatch(match, etag(file.version))) {
    res.set("ETag", etag(file.version));
    return problem(res, 412, `If-Match ${match} does not match the current ETag ${etag(file.version)}`);
  }
  // The declared size only binds the first upload; a later PUT replaces the content with whatever it sends.
  if (file.status === "pending" && file.size !== null && Number(file.size) !== content.length) return problem(res, 422, `content is ${content.length} bytes, the file declares ${file.size}`);

  const sha256 = createHash("sha256").update(content).digest("hex");
  const updated = await db.query<{ version: number }>(
    `UPDATE files SET content = $1, size = $2, sha256 = $3, status = 'complete', version = version + 1, updated_at = now(), changed_xid = pg_current_xact_id()
     WHERE id = $4 AND owner = $5 AND version = $6 RETURNING version`,
    [content, content.length, sha256, id, owner, file.version],
  );
  if (updated.rowCount === 0) {
    // Another writer bumped the version between our SELECT and UPDATE.
    const now = await db.query<{ version: number }>("SELECT version FROM files WHERE id = $1", [id]);
    res.set("ETag", etag(now.rows[0].version));
    return problem(res, 412, `If-Match ${match} lost the race to a concurrent write`);
  }
  res.set("ETag", etag(updated.rows[0].version)).json({ status: "complete" });
});

app.get("/v1/files/:id", async (req, res) => {
  const owner: string = res.locals.owner;
  const id = String(req.params.id);
  if (!UUID.test(id)) return problem(res, 404, "no such file");
  const { rows } = await db.query<Row>(`SELECT ${COLUMNS} FROM files WHERE id = $1 AND owner = $2`, [id, owner]);
  if (!rows[0]) return problem(res, 404, "no such file");
  const tag = etag(rows[0].version);
  res.set({ ETag: tag, "Cache-Control": "private, no-cache" });
  const inm = req.get("if-none-match");
  if (inm && ifNoneMatch(inm, tag)) return res.status(304).end();
  res.json(toFile(rows[0]));
});

// GET /v1/files/:id/content: conditional (If-None-Match -> 304) and partial (Range, guarded by If-Range) reads.
app.get("/v1/files/:id/content", async (req, res) => {
  const owner: string = res.locals.owner;
  const id = String(req.params.id);
  if (!UUID.test(id)) return problem(res, 404, "no such file");
  const { rows } = await db.query<{ status: string; version: number; content_type: string; content: Buffer | null }>(
    "SELECT status, version, content_type, content FROM files WHERE id = $1 AND owner = $2",
    [id, owner],
  );
  const file = rows[0];
  if (!file) return problem(res, 404, "no such file");
  if (file.status !== "complete" || !file.content) return problem(res, 409, "the file has no content yet: PUT it to upload_file_url first");
  const tag = etag(file.version);
  const content = file.content;
  res.set({ ETag: tag, "Accept-Ranges": "bytes", "Cache-Control": "private, no-cache" });

  // RFC 9110 13.2.2: If-None-Match is evaluated before Range.
  const inm = req.get("if-none-match");
  if (inm && ifNoneMatch(inm, tag)) return res.status(304).end();

  const range = req.get("range");
  const ifRange = req.get("if-range");
  // If-Range: send the range only if the client's copy is still current, otherwise the whole new content. Strong comparison; a date or weak tag never matches here.
  const rangeApplies = range && (!ifRange || ifRange.trim() === tag);
  if (rangeApplies) {
    const r = parseRange(range, content.length);
    if (r === "unsatisfiable") {
      res.set("Content-Range", `bytes */${content.length}`);
      return problem(res, 416, `range ${range} is outside the ${content.length} bytes`);
    }
    if (r) {
      return res
        .status(206)
        .set({ "Content-Type": file.content_type, "Content-Range": `bytes ${r.start}-${r.end}/${content.length}` })
        .send(content.subarray(r.start, r.end + 1));
    }
  }
  res.set("Content-Type", file.content_type).send(content);
});

// GET /v1/files?changed_since=&limit=&cursor=: a change feed paged by (changed_xid, id), not by updated_at. See README: an updated_at cursor skips rows whose transaction commits late.
app.get("/v1/files", async (req, res) => {
  const owner: string = res.locals.owner;
  const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return problem(res, 400, `limit must be an integer from 1 to ${MAX_LIMIT}`);
  let after: [string, string] | null = null;
  if (req.query.cursor !== undefined) {
    after = typeof req.query.cursor === "string" ? decodeCursor(req.query.cursor) : null;
    if (!after) return problem(res, 400, "invalid cursor");
  }
  let since: Date | null = null;
  if (req.query.changed_since !== undefined) {
    since = typeof req.query.changed_since === "string" ? new Date(req.query.changed_since) : null;
    if (!since || Number.isNaN(since.getTime())) return problem(res, 400, "changed_since must be an ISO 8601 timestamp");
  }

  // Only rows whose transaction is older than every transaction still running: none can later commit behind the cursor.
  const { rows } = await db.query<Row>(
    `SELECT ${COLUMNS} FROM files
     WHERE owner = $1
       AND changed_xid < pg_snapshot_xmin(pg_current_snapshot())
       AND ($2::timestamptz IS NULL OR updated_at >= $2)
       AND ($3::xid8 IS NULL OR (changed_xid, id) > ($3::xid8, $4::uuid))
     ORDER BY changed_xid, id
     LIMIT $5`,
    [owner, since, after?.[0] ?? null, after?.[1] ?? null, limit],
  );
  const last = rows[rows.length - 1];
  const next = last ? encodeCursor(last.changed_xid, last.id) : req.query.cursor;
  if (next) {
    const params = new URLSearchParams({ limit: String(limit), cursor: String(next) });
    if (since) params.set("changed_since", since.toISOString());
    res.set("Link", `</v1/files?${params}>; rel="next"`);
  }
  res.json(rows.map(toFile));
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (typeof err === "object" && err !== null && "type" in err) {
    if (err.type === "entity.too.large") return problem(res, 413, `body is larger than ${MAX_BYTES} bytes`);
    if (err.type === "entity.parse.failed") return problem(res, 400, "body is not valid JSON");
  }
  console.error(err);
  problem(res, 500, "internal error");
});

app.listen(PORT, () => console.log(`   [files pid ${process.pid}] listening on :${PORT}`));
