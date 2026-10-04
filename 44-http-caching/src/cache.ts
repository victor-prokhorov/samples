// A small shared cache (reverse proxy, :53154 -> origin :53054) that follows HTTP caching (RFC 9111) for the parts this sample uses:
// storability (no-store, private, Set-Cookie, Authorization, Vary: *), freshness from s-maxage or max-age, Age, no-cache,
// stale-while-revalidate, revalidation with If-None-Match (a 304 refreshes the entry), Vary with a normalised Accept-Language,
// request coalescing, and purge by URL or by tag. It follows the invalidation outbox in Postgres (LISTEN/NOTIFY + catch-up by id).
// Admin endpoints under /__cache/ (stats, purge, a test clock, the invalidation switch) stand in for a CDN's API.
import http from "node:http";
import pg from "pg";
import { CACHE_PORT, DATABASE_URL, ORIGIN_PORT } from "./db.js";
import { type CacheControl, negotiate, parseCacheControl } from "./shared.js";

type Headers = Record<string, string | string[]>;
type Entry = { url: string; vary: string[]; varyKey: string; status: number; headers: Headers; body: Buffer; storedAt: number; lifetime: number; swr: number; etag?: string; tags: string[] };
type Fetched = { status: number; headers: Headers; body: Buffer };

const store = new Map<string, Entry[]>(); // primary key (the URL) -> variants
const byTag = new Map<string, Set<Entry>>();
const inflight = new Map<string, Promise<Fetched>>();
const revalidating = new Set<Entry>();
const hitForPass = new Map<string, number>(); // URL#lang -> until when requests skip the cache, after a not-storable answer
const stats = { HIT: 0, MISS: 0, STALE: 0, REVALIDATED: 0, PASS: 0, purged: 0, originRequests: 0 };
let clockOffset = 0; // seconds, moved forward by POST /__cache/advance so the demo can show expiry without waiting
const now = () => Date.now() / 1000 + clockOffset;
const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });

// The value a request has for a header named in Vary. Accept-Language is reduced to the language the origin will choose,
// so the many spellings browsers send ("fr-FR,fr;q=0.9,en;q=0.8", "fr") share one entry instead of one each.
function varyValue(name: string, req: http.IncomingMessage) {
  if (name === "accept-language") return negotiate(req.headers["accept-language"]);
  return String(req.headers[name] ?? "");
}
const varyKeyOf = (vary: string[], req: http.IncomingMessage) => vary.map((n) => `${n}=${varyValue(n, req)}`).join("&");
const varyNames = (h: Headers) => String(h.vary ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

function lookup(url: string, req: http.IncomingMessage) {
  return store.get(url)?.find((e) => e.varyKey === varyKeyOf(e.vary, req));
}

// RFC 9111 section 3: may a shared cache store this response? Returns the reason it may not, or null.
function notStorable(req: http.IncomingMessage, res: Fetched, cc: CacheControl): string | null {
  if (res.status !== 200) return `status ${res.status}`;
  if (cc["no-store"]) return "no-store";
  if (cc.private) return "private";
  if (res.headers["set-cookie"]) return "Set-Cookie";
  if (varyNames(res.headers).includes("*")) return "Vary: *";
  if (req.headers.authorization && !(cc.public || cc["s-maxage"] || cc["must-revalidate"])) return "Authorization without public";
  if (cc["s-maxage"] === undefined && cc["max-age"] === undefined && !res.headers.etag) return "no freshness or validator";
  return null;
}

function save(url: string, req: http.IncomingMessage, res: Fetched, cc: CacheControl): Entry {
  const vary = varyNames(res.headers);
  const entry: Entry = {
    url,
    vary,
    varyKey: varyKeyOf(vary, req),
    status: res.status,
    headers: res.headers,
    body: res.body,
    storedAt: now(),
    lifetime: cc["no-cache"] ? 0 : Number(cc["s-maxage"] ?? cc["max-age"] ?? 0),
    swr: Number(cc["stale-while-revalidate"] ?? 0),
    etag: res.headers.etag as string | undefined,
    tags: String(res.headers["cache-tag"] ?? "").split(/[\s,]+/).filter(Boolean),
  };
  const variants = store.get(url) ?? [];
  for (const old of variants.filter((e) => e.varyKey === entry.varyKey)) for (const t of old.tags) byTag.get(t)?.delete(old);
  store.set(url, [...variants.filter((e) => e.varyKey !== entry.varyKey), entry]);
  for (const t of entry.tags) byTag.set(t, (byTag.get(t) ?? new Set()).add(entry));
  return entry;
}

function remove(e: Entry) {
  const left = (store.get(e.url) ?? []).filter((x) => x !== e);
  if (left.length) store.set(e.url, left);
  else store.delete(e.url);
  for (const t of e.tags) byTag.get(t)?.delete(e);
  stats.purged++;
}

// One request to the origin. Hop-by-hop headers are dropped; Accept-Language is sent normalised so the answer matches the key.
function forward(req: http.IncomingMessage, extra: Record<string, string> = {}, drop: string[] = []): Promise<Fetched> {
  const headers: Headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined && !["connection", "keep-alive", "host", ...drop].includes(k)) headers[k] = v;
  if (req.headers["accept-language"]) headers["accept-language"] = negotiate(req.headers["accept-language"]);
  Object.assign(headers, extra);
  stats.originRequests++;
  return new Promise((resolve, reject) => {
    const up = http.request({ host: "127.0.0.1", port: ORIGIN_PORT, method: req.method, path: req.url, headers, agent }, (r) => {
      const chunks: Buffer[] = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => resolve({ status: r.statusCode ?? 502, headers: r.headers as Headers, body: Buffer.concat(chunks) }));
    });
    up.on("error", reject);
    up.end();
  });
}

function reply(req: http.IncomingMessage, res: http.ServerResponse, outcome: keyof typeof stats, r: { status: number; headers: Headers; body: Buffer }, age?: number) {
  stats[outcome]++;
  const headers: Headers = { ...r.headers, "x-cache": outcome };
  delete headers["cache-tag"]; // internal to the cache, like Fastly's Surrogate-Key
  delete headers["connection"];
  delete headers["keep-alive"];
  delete headers["transfer-encoding"];
  if (age !== undefined) headers.age = String(Math.floor(age));
  if (r.status === 200 && r.headers.etag && req.headers["if-none-match"] === r.headers.etag) {
    delete headers["content-length"];
    res.writeHead(304, headers);
    return res.end();
  }
  headers["content-length"] = String(r.body.length);
  res.writeHead(r.status, headers);
  res.end(req.method === "HEAD" ? undefined : r.body);
}

// Ask the origin whether a stored entry is still current. 304: keep the body, take the new headers, restart its clock.
async function revalidate(e: Entry, req: http.IncomingMessage): Promise<Entry | Fetched> {
  const r = await forward(req, e.etag ? { "if-none-match": e.etag } : {}, ["if-none-match", "if-modified-since"]);
  if (r.status === 304) {
    const cc = parseCacheControl(r.headers["cache-control"] ?? e.headers["cache-control"]);
    e.headers = { ...e.headers, ...r.headers, "content-length": String(e.body.length) };
    e.storedAt = now();
    e.lifetime = cc["no-cache"] ? 0 : Number(cc["s-maxage"] ?? cc["max-age"] ?? e.lifetime);
    return e;
  }
  const cc = parseCacheControl(r.headers["cache-control"]);
  remove(e);
  stats.purged--;
  return notStorable(req, r, cc) ? r : save(e.url, req, r, cc);
}

async function admin(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const json = (data: unknown) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (url.pathname === "/__cache/stats") {
    const entries = [...store.values()].flat().map((e) => ({ url: e.url, vary: e.varyKey, age: Math.floor(now() - e.storedAt), lifetime: e.lifetime, tags: e.tags }));
    json({ ...stats, entries });
    if (url.searchParams.has("reset")) for (const k of Object.keys(stats) as (keyof typeof stats)[]) stats[k] = 0;
    return;
  }
  if (url.pathname === "/__cache/purge") {
    const tag = url.searchParams.get("tag");
    const target = url.searchParams.get("url");
    const victims = tag ? [...(byTag.get(tag) ?? [])] : target ? (store.get(target) ?? []) : [...store.values()].flat();
    for (const e of [...victims]) remove(e);
    for (const k of hitForPass.keys()) if (!tag && (!target || k.startsWith(`${target}#`))) hitForPass.delete(k);
    console.log(`[cache] purge ${tag ? `tag ${tag}` : target ? `url ${target}` : "everything"}: ${victims.length} entries`);
    return json({ purged: victims.length });
  }
  if (url.pathname === "/__cache/advance") {
    clockOffset += Number(url.searchParams.get("seconds") ?? 0);
    return json({ clockOffset });
  }
  if (url.pathname === "/__cache/invalidation") {
    await setInvalidation(url.searchParams.get("on") === "1");
    return json({ on: invalidationOn });
  }
  res.writeHead(404).end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${CACHE_PORT}`);
  try {
    if (url.pathname.startsWith("/__cache/")) return await admin(req, res, url);
    const key = url.pathname + url.search;
    if (req.method !== "GET" && req.method !== "HEAD") return reply(req, res, "PASS", await forward(req));

    const e = lookup(key, req);
    if (e) {
      const age = now() - e.storedAt;
      if (age < e.lifetime) return reply(req, res, "HIT", e, age);
      if (age < e.lifetime + e.swr) {
        // Stale but inside stale-while-revalidate: answer now, refresh in the background (once).
        if (!revalidating.has(e)) {
          revalidating.add(e);
          revalidate(e, req)
            .catch((err) => console.error("[cache] background revalidation failed", err))
            .finally(() => revalidating.delete(e));
        }
        return reply(req, res, "STALE", e, age);
      }
      const r = await revalidate(e, req);
      return reply(req, res, r === e ? "REVALIDATED" : "MISS", r, r === e ? 0 : undefined);
    }

    // A URL that answered "not storable" recently is passed straight through (Varnish calls this hit-for-pass):
    // no waiting behind other members' requests, and the client's If-None-Match reaches the origin, which can answer 304.
    const flightKey = `${key}#${negotiate(req.headers["accept-language"])}`;
    if ((hitForPass.get(flightKey) ?? 0) > now()) return reply(req, res, "PASS", await forward(req));

    // Miss. Concurrent misses for the same URL and language share one origin request; if the answer turns out not to be
    // storable (private, personal), each waiter goes to the origin itself, so one member's response never reaches another.
    let leader = false;
    let p = inflight.get(flightKey);
    if (!p) {
      leader = true;
      p = forward(req, {}, ["if-none-match", "if-modified-since"]);
      inflight.set(flightKey, p);
      p.finally(() => inflight.delete(flightKey)).catch(() => {});
    }
    let r = await p;
    let cc = parseCacheControl(r.headers["cache-control"]);
    let reason = notStorable(req, r, cc);
    if (reason && !leader) {
      r = await forward(req, {}, ["if-none-match", "if-modified-since"]);
      cc = parseCacheControl(r.headers["cache-control"]);
      reason = notStorable(req, r, cc);
    }
    if (reason) {
      hitForPass.set(flightKey, now() + 120);
      return reply(req, res, "PASS", r);
    }
    const stored = leader ? save(key, req, r, cc) : (lookup(key, req) ?? save(key, req, r, cc));
    return reply(req, res, "MISS", stored, 0);
  } catch (err) {
    console.error("[cache]", err);
    res.writeHead(502).end();
  }
});

// Event-driven invalidation: LISTEN wakes us at commit; the outbox rows say what to purge, and let us catch up after a disconnect.
let invalidationOn = false;
let listener: pg.Client | null = null;
let lastSeen = 0;

async function catchUp(client: pg.Client) {
  const rows = (await client.query("SELECT id, tag, reason, round(extract(epoch FROM clock_timestamp() - created_at) * 1000) AS lag_ms FROM cache_invalidations WHERE id > $1 ORDER BY id", [lastSeen])).rows;
  for (const r of rows) {
    const victims = [...(byTag.get(r.tag) ?? [])];
    for (const e of victims) remove(e);
    lastSeen = Number(r.id);
    console.log(`[cache] outbox #${r.id} (${r.reason}): purged tag ${r.tag}, ${victims.length} entries, ${r.lag_ms} ms after the change`);
  }
}

async function connect() {
  const client = new pg.Client({ connectionString: DATABASE_URL, application_name: "cache-invalidation" });
  client.on("error", () => {});
  client.on("end", () => {
    if (listener === client && invalidationOn) {
      listener = null;
      console.log(`[cache] invalidation connection lost; reconnecting and replaying the outbox after #${lastSeen}`);
      setTimeout(() => invalidationOn && connect().catch((e) => console.error("[cache] reconnect failed", e)), 250);
    }
  });
  await client.connect();
  client.on("notification", () => catchUp(client).catch((e) => console.error("[cache] catch-up failed", e)));
  await client.query("LISTEN cache_invalidations");
  listener = client;
  await catchUp(client);
}

async function setInvalidation(on: boolean) {
  if (on === invalidationOn) return;
  invalidationOn = on;
  if (on) {
    // Turning it on starts from the newest outbox row: like a cache that never had invalidation, it does not replay history.
    const c = new pg.Client({ connectionString: DATABASE_URL });
    await c.connect();
    lastSeen = Number((await c.query("SELECT coalesce(max(id), 0) AS id FROM cache_invalidations")).rows[0].id);
    await c.end();
    await connect();
    console.log(`[cache] invalidation on: LISTEN cache_invalidations, outbox after #${lastSeen}`);
  } else {
    const c = listener;
    listener = null;
    await c?.end();
    console.log("[cache] invalidation off: entries live until their TTL");
  }
}

await setInvalidation(process.env.INVALIDATION !== "off");
server.keepAliveTimeout = 30_000;
server.listen(CACHE_PORT, () => console.log(`[cache] shared cache on :${CACHE_PORT} -> origin :${ORIGIN_PORT}`));
process.on("SIGTERM", async () => {
  setTimeout(() => process.exit(0), 1000).unref();
  invalidationOn = false;
  await listener?.end();
  server.close();
  server.closeAllConnections();
  process.exit(0);
});
