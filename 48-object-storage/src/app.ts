// The member app (node:http, :53058). It signs URLs and keeps metadata; with presigned uploads it never touches the bytes.
// Two comparison routes (/api/proxy-upload?mode=buffer|stream) do it the old way, so the demo can measure the difference.
import http from "node:http";
import { randomUUID } from "node:crypto";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { db } from "./db.js";
import { page } from "./page.js";
import { ALLOWED_TYPES, APP_PORT, BUCKET, MAX_BYTES, STORAGE_URL, UPLOAD_TTL_SECONDS, presignGet, presignPut, s3 } from "./s3.js";

const MEMBER = "acme-m1001"; // one signed-in member, to keep the sample about storage rather than sessions

// Resource meter: bytes of request bodies read by this process, CPU time, and peak live memory (JS heap + Buffers) sampled every 20 ms (a sampler that wakes more often costs CPU in proportion to wall time).
// Live memory rather than RSS: the allocator keeps freed pages, so RSS stays high after the first big upload and hides the next one.
const live = () => {
  const m = process.memoryUsage();
  return m.heapUsed + m.external;
};
let meter = { since: process.cpuUsage(), bytesIn: 0, memStart: live(), memPeak: 0 };
function resetMeter() {
  globalThis.gc?.();
  const mem = live();
  meter = { since: process.cpuUsage(), bytesIn: 0, memStart: mem, memPeak: mem };
}
setInterval(() => (meter.memPeak = Math.max(meter.memPeak, live())), 20).unref();

async function body(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) {
    meter.bytesIn += c.length;
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

function send(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

const row = async (id: string) => (/^[0-9a-f-]{36}$/.test(id) ? (await db.query("SELECT * FROM uploads WHERE id = $1 AND member_id = $2", [id, MEMBER])).rows[0] : undefined);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${APP_PORT}`);
  const path = url.pathname;
  try {
    if (req.method === "GET" && path === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(page());
    }
    if (req.method === "GET" && path === "/api/uploads") {
      const r = await db.query("SELECT id, filename, content_type, size, status, verdict FROM uploads WHERE member_id = $1 ORDER BY created_at", [MEMBER]);
      return send(res, 200, r.rows);
    }
    // 1. Ask for an upload: the app checks type and size, records the row, and signs a PUT for exactly that type and size.
    if (req.method === "POST" && path === "/api/uploads") {
      const { filename, contentType, size } = JSON.parse((await body(req)).toString() || "{}");
      if (typeof filename !== "string" || !filename || filename.length > 200) return send(res, 400, { error: "filename is required" });
      if (!ALLOWED_TYPES.has(contentType)) return send(res, 400, { error: `type ${contentType} is not accepted (allowed: ${[...ALLOWED_TYPES].join(", ")})` });
      if (!Number.isInteger(size) || size < 1 || size > MAX_BYTES) return send(res, 400, { error: `size must be 1..${MAX_BYTES} bytes` });
      const id = randomUUID();
      const key = `quarantine/${id}`;
      await db.query("INSERT INTO uploads (id, member_id, filename, content_type, size, key) VALUES ($1, $2, $3, $4, $5, $6)", [id, MEMBER, filename, contentType, size, key]);
      const uploadUrl = await presignPut(key, contentType, size);
      return send(res, 201, { id, method: "PUT", url: uploadUrl, headers: { "content-type": contentType }, expiresIn: UPLOAD_TTL_SECONDS });
    }
    // 2. The browser says it is done. Trust nothing: HEAD the object and compare with what was signed.
    let m = /^\/api\/uploads\/([^/]+)\/complete$/.exec(path);
    if (req.method === "POST" && m) {
      const u = await row(m[1]);
      if (!u) return send(res, 404, { error: "no such upload" });
      if (u.status !== "pending") return send(res, 200, { id: u.id, status: u.status });
      const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: u.key })).catch(() => null);
      if (!head) return send(res, 409, { error: "object not found in storage: upload it first" });
      if (head.ContentLength !== Number(u.size) || head.ContentType !== u.content_type) return send(res, 409, { error: "stored object does not match the request" });
      await db.query("UPDATE uploads SET status = 'uploaded', uploaded_at = now() WHERE id = $1", [u.id]);
      return send(res, 200, { id: u.id, status: "uploaded", etag: head.ETag });
    }
    m = /^\/api\/uploads\/([^/]+)$/.exec(path);
    if (req.method === "GET" && m) {
      const u = await row(m[1]);
      return u ? send(res, 200, { id: u.id, status: u.status, verdict: u.verdict, key: u.key }) : send(res, 404, { error: "no such upload" });
    }
    // 3. Download: only a clean object, through a short-lived presigned GET that sets Content-Disposition.
    m = /^\/api\/uploads\/([^/]+)\/download$/.exec(path);
    if (req.method === "GET" && m) {
      const u = await row(m[1]);
      if (!u) return send(res, 404, { error: "no such upload" });
      if (u.status !== "clean") return send(res, 409, { error: `not downloadable while ${u.status}` });
      res.writeHead(302, { location: await presignGet(u.key, u.filename, u.content_type), "cache-control": "no-store" });
      return res.end();
    }
    // The old way, for comparison: the bytes come through this process on their way to storage.
    if (req.method === "POST" && path === "/api/proxy-upload") {
      const mode = url.searchParams.get("mode");
      const type = String(req.headers["content-type"]);
      const size = Number(req.headers["content-length"]);
      const target = await presignPut(`proxied/${mode}-${randomUUID()}`, type, size);
      if (mode === "buffer") {
        const all = await body(req); // the whole file in this process's memory
        const r = await fetch(target, { method: "PUT", body: new Uint8Array(all.buffer as ArrayBuffer, all.byteOffset, all.byteLength), headers: { "content-type": type } });
        return send(res, r.status === 200 ? 201 : 502, { stored: r.status, bytes: all.length });
      }
      // stream: piped through with back-pressure, so memory stays flat, but every byte still costs this process CPU and a socket for the whole upload
      const status = await new Promise<number>((resolve, reject) => {
        const up = http.request(target, { method: "PUT", headers: { "content-type": type, "content-length": size } }, (r) => {
          r.resume();
          resolve(r.statusCode ?? 502);
        });
        up.on("error", reject);
        req.on("data", (c: Buffer) => (meter.bytesIn += c.length));
        req.pipe(up);
      });
      return send(res, status === 200 ? 201 : 502, { stored: status, bytes: size });
    }
    if (req.method === "GET" && path === "/metrics") {
      const cpu = process.cpuUsage(meter.since);
      const out = { bytesIn: meter.bytesIn, cpuMs: Math.round((cpu.user + cpu.system) / 1000), peakMemMB: +((meter.memPeak - meter.memStart) / 1048576).toFixed(1) };
      if (url.searchParams.has("reset")) resetMeter();
      return send(res, 200, out);
    }
    if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true, storage: STORAGE_URL });
    send(res, 404, { error: "not found" });
  } catch (e) {
    console.error("[app]", e);
    send(res, 500, { error: String(e) });
  }
});
server.listen(APP_PORT, () => console.log(`[app] member app on :${APP_PORT}`));
process.on("SIGTERM", () => server.close(() => db.end().then(() => process.exit(0))));
