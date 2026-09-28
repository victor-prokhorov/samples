import { createHash } from "node:crypto";
import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { paymentsDb, tx } from "./db.js";
import { CATALOG_PORT, PAYMENTS_PORT } from "./resilience.js";

const KINDS = ["ok", "503", "400", "reset", "slow", "reply-late", "commit-late"] as const;

export type Kind = (typeof KINDS)[number];

export type Faults = { script: Kind[]; mode: Kind; capacity: number };

export type Work = { ms: number; outcome: "completed" | "cancelled at deadline"; callerGone: boolean };

export type Stats = { arrivals: number[]; work: Work[] };

const SLOW_MS = 1500;
const LATE_MS = 1000;

let faults: Faults = { script: [], mode: "ok", capacity: 0 };
let resetAt = performance.now();
let stats: Stats = { arrivals: [], work: [] };
let windows = new Map<number, number>();

function isKind(v: unknown): v is Kind {
  return KINDS.some((k) => k === v);
}

function isFaults(v: unknown): v is Faults {
  return typeof v === "object" && v !== null && "script" in v && Array.isArray(v.script) && v.script.every(isKind) && "mode" in v && isKind(v.mode) && "capacity" in v && typeof v.capacity === "number";
}

function isChargeRequest(v: unknown): v is { customer: string; amount: string } {
  return typeof v === "object" && v !== null && "customer" in v && typeof v.customer === "string" && "amount" in v && typeof v.amount === "string";
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function json(res: http.ServerResponse, status: number, body: object, headers: Record<string, string> = {}) {
  if (res.destroyed) return;
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

function header(req: http.IncomingMessage, name: string) {
  const value = req.headers[name];
  return typeof value === "string" ? value : undefined;
}

function shed() {
  const window = Math.floor((performance.now() - resetAt) / 25);
  const seen = (windows.get(window) ?? 0) + 1;
  windows.set(window, seen);
  return faults.capacity > 0 && seen > faults.capacity;
}

async function quote(req: http.IncomingMessage, res: http.ServerResponse, kind: Kind) {
  if (kind !== "slow") return json(res, 200, { price: "42.00" });
  const budget = Number(header(req, "x-deadline-ms") ?? 0);
  const started = performance.now();
  let callerGone = false;
  res.on("close", () => (callerGone = !res.writableFinished));
  try {
    await tx(paymentsDb, async (c) => {
      if (budget > 0) await c.query(`SET LOCAL statement_timeout = ${Math.floor(budget)}`);
      await c.query("SELECT pg_sleep($1)", [SLOW_MS / 1000]);
    });
    stats.work.push({ ms: Math.round(performance.now() - started), outcome: "completed", callerGone });
    json(res, 200, { price: "42.00" });
  } catch (err) {
    stats.work.push({ ms: Math.round(performance.now() - started), outcome: "cancelled at deadline", callerGone });
    json(res, 504, { error: err instanceof Error ? err.message : String(err) });
  }
}

async function insertCharge(customer: string, amount: string, key: string | null, kind: Kind) {
  return tx(paymentsDb, async (c) => {
    const { rows } = await c.query("INSERT INTO charges (customer, amount, idempotency_key) VALUES ($1, $2, $3) RETURNING id, customer, amount", [customer, amount, key]);
    if (kind === "commit-late") await c.query("SELECT pg_sleep($1)", [LATE_MS / 1000]);
    if (key) await c.query("UPDATE idempotency_keys SET response_status = 201, response_body = $2 WHERE key = $1", [key, rows[0]]);
    return rows[0];
  });
}

async function charge(req: http.IncomingMessage, res: http.ServerResponse, kind: Kind) {
  const text = await readBody(req);
  const body = parse(text);
  if (!isChargeRequest(body)) return json(res, 400, { error: "expected { customer, amount }" });
  const key = header(req, "idempotency-key") ?? null;
  if (key) {
    const hash = createHash("sha256").update(text).digest("hex");
    const claimed = await paymentsDb.query("INSERT INTO idempotency_keys (key, request_hash) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING", [key, hash]);
    if (!claimed.rowCount) {
      const { rows } = await paymentsDb.query("SELECT request_hash, response_status, response_body FROM idempotency_keys WHERE key = $1", [key]);
      if (rows[0].request_hash !== hash) return json(res, 422, { error: "idempotency key reused with a different request" });
      if (rows[0].response_status === null) return json(res, 409, { error: "a request with this key is in flight" }, { "retry-after": "1" });
      return json(res, rows[0].response_status, rows[0].response_body, { "idempotent-replayed": "true" });
    }
  }
  const row = await insertCharge(body.customer, body.amount, key, kind).catch(async (err) => {
    if (key) await paymentsDb.query("DELETE FROM idempotency_keys WHERE key = $1 AND response_status IS NULL", [key]);
    throw err;
  });
  if (kind === "reply-late") await sleep(LATE_MS);
  json(res, 201, row);
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method === "PUT" && req.url === "/_faults") {
    const next = parse(await readBody(req));
    if (!isFaults(next)) return json(res, 400, { error: "expected { script, mode, capacity }" });
    faults = next;
    resetAt = performance.now();
    stats = { arrivals: [], work: [] };
    windows = new Map();
    return json(res, 200, faults);
  }
  if (req.url === "/_stats") return json(res, 200, stats);
  stats.arrivals.push(Math.round(performance.now() - resetAt));
  if (shed()) return json(res, 503, { error: "overloaded, request shed" });
  const kind = faults.script.shift() ?? faults.mode;
  if (kind === "reset") return req.socket.destroy();
  if (kind === "503") return json(res, 503, { error: "service unavailable" });
  if (kind === "400") return json(res, 400, { error: "invalid amount" });
  if (req.url === "/quote") return quote(req, res, kind);
  if (req.method === "POST" && req.url === "/charges") return charge(req, res, kind);
  json(res, 404, { error: "not found" });
}

function listen(server: http.Server, port: number) {
  return new Promise<void>((resolve) => server.listen(port, resolve));
}

async function main() {
  await listen(http.createServer((req, res) => handle(req, res).catch((err) => json(res, 500, { error: err instanceof Error ? err.message : String(err) }))), PAYMENTS_PORT);
  await listen(http.createServer((_req, res) => json(res, 200, { items: ["keyboard", "mouse"] })), CATALOG_PORT);
  console.log(`   [payments pid ${process.pid}] listening on :${PAYMENTS_PORT}, catalog on :${CATALOG_PORT}`);
}

main();
