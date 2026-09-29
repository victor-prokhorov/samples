import { ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { PORT, db } from "./db.js";

const BASE = `http://localhost:${PORT}`;
const ALICE = "token-alice";
const BOB = "token-bob";

type Reply = { status: number; headers: Headers; text: string; bytes: Buffer };
type Opts = { token?: string | null; headers?: Record<string, string>; json?: unknown; raw?: Buffer };

async function http(method: string, path: string, o: Opts = {}): Promise<Reply> {
  const headers: Record<string, string> = { ...o.headers };
  const token = o.token === undefined ? ALICE : o.token;
  if (token) headers.authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (o.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(o.json);
  } else if (o.raw) {
    headers["content-type"] ??= "application/octet-stream";
    body = new Blob([new Uint8Array(o.raw)]);
  }
  const res = await fetch(BASE + path, { method, headers, body });
  const bytes = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, text: bytes.toString(), bytes };
}

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

const short = (id: string) => id.slice(0, 8);

// One log line per exchange: request, status, the headers that matter, body.
function show(label: string, r: Reply, opts: { body?: boolean } = {}) {
  const hs = ["etag", "idempotent-replayed", "content-range", "www-authenticate"]
    .filter((h) => r.headers.has(h))
    .map((h) => `${h}: ${r.headers.get(h)}`);
  let body = "";
  if (opts.body !== false && r.text) {
    const type = r.headers.get("content-type") ?? "";
    body = type.includes("json") ? JSON.stringify(JSON.parse(r.text), (k, v) => (k === "fileId" && typeof v === "string" ? short(v) : v)) : JSON.stringify(r.text);
    body = body.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (m) => short(m));
  }
  console.log(`   ${label.padEnd(62)} -> ${r.status}${hs.length ? ` [${hs.join(", ")}]` : ""}${body ? ` ${body}` : ""}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

async function create(name: string, size?: number, key = randomUUID()) {
  const r = await http("POST", "/v1/files", { headers: { "idempotency-key": key }, json: { name, content_type: "text/plain", size } });
  check(r.status === 201 || r.status === 200, `create ${name}`);
  return { id: JSON.parse(r.text).fileId as string, reply: r };
}

async function upload(id: string, etag: string, content: string) {
  return http("PUT", `/v1/files/${id}/content`, { headers: { "if-match": etag }, raw: Buffer.from(content) });
}

async function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], { stdio: "inherit" });
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${BASE}/v1/files`);
      return child;
    } catch {
      await sleep(100);
    }
  }
  throw new Error("files server did not start");
}

async function auth() {
  step("1. Bearer token, and files scoped to their owner", "no token is 401 with WWW-Authenticate; another owner's file is 404, not 403, so ids do not leak which files exist");
  show("GET /v1/files (no Authorization)", await http("GET", "/v1/files", { token: null }));
  show("GET /v1/files (Bearer wrong)", await http("GET", "/v1/files", { token: "wrong" }));
  const { id } = await create("alice-private.txt");
  show(`GET /v1/files/${short(id)} as alice`, await http("GET", `/v1/files/${id}`), { body: false });
  show(`GET /v1/files/${short(id)} as bob`, await http("GET", `/v1/files/${id}`, { token: BOB }));
}

async function idempotency() {
  step("2. POST /v1/files with an Idempotency-Key", "a timed-out POST may have committed; the client sends one key per logical create and reuses it on every retry, so a retry returns the first answer instead of a second file");
  const key = randomUUID();
  const meta = { name: "report.txt", content_type: "text/plain", size: 25 };
  console.log(`   Idempotency-Key ${short(key)}...`);
  const first = await http("POST", "/v1/files", { headers: { "idempotency-key": key }, json: meta });
  show("POST /v1/files", first);
  show("POST /v1/files (retry, same key and body)", await http("POST", "/v1/files", { headers: { "idempotency-key": key }, json: meta }));
  show("POST /v1/files (same key, different body)", await http("POST", "/v1/files", { headers: { "idempotency-key": key }, json: { ...meta, name: "other.txt" } }));
  show("POST /v1/files (no Idempotency-Key)", await http("POST", "/v1/files", { json: meta }));

  const racing = randomUUID();
  const both = await Promise.all([1, 2].map(() => http("POST", "/v1/files", { headers: { "idempotency-key": racing }, json: { name: "race.txt", content_type: "text/plain" } })));
  both.forEach((r, i) => show(`POST /v1/files (concurrent duplicate ${i + 1} of 2)`, r));
  const ids = new Set(both.map((r) => JSON.parse(r.text).fileId));
  const { rows } = await db.query("SELECT count(*)::int AS n FROM files WHERE name IN ('report.txt', 'race.txt', 'other.txt')");
  console.log(`   => ${ids.size} fileId for 2 concurrent requests; files rows named report/race/other: ${rows[0].n} (the duplicate waited on the key's primary key, then replayed)`);
  return JSON.parse(first.text).fileId as string;
}

async function conditionalWrites(id: string) {
  step("3. PUT content with If-Match", "the ETag is the file's version; a write must name the version it read, and the check is inside the UPDATE, so a stale or concurrent writer gets 412 instead of silently overwriting (a lost update)");
  const content = "quarterly numbers: 1 2 3\n";
  show("PUT content (no If-Match)", await http("PUT", `/v1/files/${id}/content`, { raw: Buffer.from(content) }));
  show('PUT content If-Match "1", Content-Type: text/plain', await http("PUT", `/v1/files/${id}/content`, { headers: { "if-match": '"1"', "content-type": "text/plain" }, raw: Buffer.from(content) }));
  show('PUT content If-Match "1", 3 bytes (declared 25)', await upload(id, '"1"', "abc"));
  show('PUT content If-Match "1", 25 bytes', await upload(id, '"1"', content));
  show(`GET /v1/files/${short(id)}`, await http("GET", `/v1/files/${id}`));
  show('PUT content If-Match "1" (stale: someone already wrote "2")', await upload(id, '"1"', "stale client's version\n"));
  show('PUT content If-Match W/"2" (weak never matches If-Match)', await upload(id, 'W/"2"', "weak tag version\n"));

  const writers = await Promise.all(["writer A's version\n", "writer B's version\n"].map((c) => upload(id, '"2"', c)));
  writers.forEach((r, i) => show(`PUT content If-Match "2" (concurrent writer ${"AB"[i]})`, r));
  const { rows } = await db.query("SELECT version, convert_from(content, 'UTF8') AS content FROM files WHERE id = $1", [id]);
  console.log(`   => exactly one writer won: version ${rows[0].version}, content ${JSON.stringify(rows[0].content)}`);
}

async function conditionalReads(id: string) {
  step("4. GET with If-None-Match: revalidate instead of downloading again", "the client keeps the ETag it got; If-None-Match with the current ETag returns 304 and no body. A weak W/ tag matches here: If-None-Match uses the weak comparison");
  const meta = await http("GET", `/v1/files/${id}`);
  const tag = meta.headers.get("etag") ?? "";
  show(`GET /v1/files/${short(id)} If-None-Match ${tag}`, await http("GET", `/v1/files/${id}`, { headers: { "if-none-match": tag } }));
  show(`GET /content If-None-Match ${tag}`, await http("GET", `/v1/files/${id}/content`, { headers: { "if-none-match": tag } }));
  show(`GET /content If-None-Match W/${tag}`, await http("GET", `/v1/files/${id}/content`, { headers: { "if-none-match": `W/${tag}` } }));
  show(`GET /content If-None-Match "1" (an old version)`, await http("GET", `/v1/files/${id}/content`, { headers: { "if-none-match": '"1"' } }));
}

async function ranges() {
  step("5. Range and If-Range: resume a download without splicing two versions", "Range asks for part of the content (206 + Content-Range). If-Range carries the ETag of the part already downloaded: if the file changed since, the server sends the whole new content (200) rather than the rest of a different file");
  const pending = await create("video.bin");
  show("GET /content before any PUT", await http("GET", `/v1/files/${pending.id}/content`));
  await upload(pending.id, '"1"', "0123456789abcdefghijklmnopqrstuvwxyz");
  const id = pending.id;
  const part = await http("GET", `/v1/files/${id}/content`, { headers: { range: "bytes=0-9" } });
  show("GET /content Range: bytes=0-9 (connection drops after this)", part);
  const tag = part.headers.get("etag") ?? "";
  show(`GET /content Range: bytes=10- If-Range: ${tag}`, await http("GET", `/v1/files/${id}/content`, { headers: { range: "bytes=10-", "if-range": tag } }));
  show("GET /content Range: bytes=-6 (last 6 bytes)", await http("GET", `/v1/files/${id}/content`, { headers: { range: "bytes=-6" } }));
  show("GET /content Range: bytes=100-", await http("GET", `/v1/files/${id}/content`, { headers: { range: "bytes=100-" } }));
  show(`PUT content If-Match ${tag} (the file changes)`, await upload(id, tag, "ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210"));
  const stale = await http("GET", `/v1/files/${id}/content`, { headers: { range: "bytes=10-", "if-range": tag } });
  show(`GET /content Range: bytes=10- If-Range: ${tag} (stale)`, stale);
  const spliced = part.text + (await http("GET", `/v1/files/${id}/content`, { headers: { range: "bytes=10-" } })).text;
  console.log(`   => with If-Range the client gets the new file whole; resuming with Range alone would have spliced ${JSON.stringify(spliced)}`);
}

async function changeFeed() {
  step("6. GET /v1/files?changed_since=&limit=&cursor=: a change feed", "keyset paging on (changed_xid, id), the next page in a Link header; the last cursor is a sync token the client keeps and polls with later");
  const since = new Date().toISOString();
  await sleep(5);
  const made: string[] = [];
  for (const name of ["a.txt", "b.txt", "c.txt", "d.txt", "e.txt"]) made.push((await create(name)).id);
  let path = `/v1/files?changed_since=${encodeURIComponent(since)}&limit=2`;
  let cursor = "";
  for (let page = 1; ; page++) {
    const r = await http("GET", path);
    const names = JSON.parse(r.text).map((f: { name: string }) => f.name);
    const link = r.headers.get("link") ?? "";
    console.log(`   page ${page}: ${r.status} ${JSON.stringify(names)}${link ? " Link: rel=next" : ""}`);
    const next = /<([^>]+)>; rel="next"/.exec(link);
    if (!next) break;
    path = next[1];
    cursor = new URL(path, BASE).searchParams.get("cursor") ?? "";
    if (names.length === 0) break;
  }

  step("7. Why the cursor is changed_xid and not updated_at", "updated_at is set when a transaction runs, but rows become visible when it commits. A slow transaction commits a row stamped earlier than rows a client already paged past; an updated_at cursor never looks back, so the change is lost. The feed only serves rows older than the oldest running transaction (pg_snapshot_xmin)");
  // Timestamps stay text: a JS Date would drop Postgres's microseconds.
  const naive = await db.query<{ t: string }>("SELECT max(updated_at)::text AS t FROM files WHERE owner = 'alice'");
  let naiveCursor = naive.rows[0].t;
  const naivePoll = async () => {
    const { rows } = await db.query<{ name: string; updated_at: string }>("SELECT name, updated_at::text FROM files WHERE owner = 'alice' AND updated_at > $1 ORDER BY updated_at, id", [naiveCursor]);
    if (rows.length) naiveCursor = rows[rows.length - 1].updated_at;
    return rows.map((r) => r.name);
  };
  const feedPoll = async () => {
    const r = await http("GET", `/v1/files?limit=50&cursor=${encodeURIComponent(cursor)}`);
    const rows = JSON.parse(r.text);
    const next = /cursor=([^&>]+)/.exec(r.headers.get("link") ?? "");
    if (next) cursor = decodeURIComponent(next[1]);
    return rows.map((f: { name: string }) => f.name);
  };
  console.log("   both clients are caught up: the updated_at client at max(updated_at), the feed client at its last cursor");

  const slow = await db.connect();
  await slow.query("BEGIN");
  await slow.query("UPDATE files SET name = 'a-renamed.txt', version = version + 1, updated_at = now(), changed_xid = pg_current_xact_id() WHERE id = $1", [made[0]]);
  console.log("   slow transaction: renames a.txt (updated_at = its start time), not committed yet");
  await sleep(50);
  const b = await upload(made[1], '"1"', "b content");
  console.log(`   meanwhile PUT b.txt content -> ${b.status}, committed`);
  console.log(`   poll: updated_at client sees ${JSON.stringify(await naivePoll())} and moves its cursor past b.txt`);
  console.log(`   poll: feed client sees        ${JSON.stringify(await feedPoll())} (b.txt is held back while an older transaction is still running)`);
  await slow.query("COMMIT");
  slow.release();
  console.log("   slow transaction commits");
  const naiveAfter = await naivePoll();
  const feedAfter = await feedPoll();
  console.log(`   poll: updated_at client sees ${JSON.stringify(naiveAfter)} <- the rename is lost: it is stamped before b.txt`);
  console.log(`   poll: feed client sees        ${JSON.stringify(feedAfter)}`);
  console.log(`   poll: feed client again       ${JSON.stringify(await feedPoll())} (nothing new; same sync token)`);
}

let server: ChildProcess | undefined;
try {
  server = await startServer();
  console.log(`client pid ${process.pid} -> files API on :${PORT} (Express, a separate process, metadata and content in Postgres)`);
  await auth();
  const id = await idempotency();
  await conditionalWrites(id);
  await conditionalReads(id);
  await ranges();
  await changeFeed();
} finally {
  server?.kill();
  if (server) await once(server, "exit");
  await db.end();
}
