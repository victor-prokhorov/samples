// The member API under test. node:http, one pg pool.
import http from "node:http";
import { PORT, SERVICE_MS, db } from "./db.js";

let inflight = 0;
let served = 0;
let errors = 0;
let abandoned = 0;

class ClientGone extends Error {}

// Take a connection, then check the client is still there before using it: when a load test (or a browser, or a
// proxy) gives up, the requests queued for a connection are dropped instead of running for nobody.
async function query(req: http.IncomingMessage, sql: string, params: unknown[]) {
  const c = await db.connect();
  try {
    if (req.socket.destroyed) throw new ClientGone();
    return await c.query(sql, params);
  } finally {
    c.release();
  }
}

const json = (res: http.ServerResponse, status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));

async function route(req: http.IncomingMessage, url: URL, res: http.ServerResponse) {
  let m: RegExpMatchArray | null;
  if (url.pathname === "/health") return json(res, 200, { ok: true });
  if (url.pathname === "/metrics") {
    const mem = process.memoryUsage();
    return json(res, 200, { rssMb: +(mem.rss / 2 ** 20).toFixed(1), heapMb: +(mem.heapUsed / 2 ** 20).toFixed(1), pool: { total: db.totalCount, idle: db.idleCount, waiting: db.waitingCount }, inflight, served, errors, abandoned });
  }
  if (url.pathname === "/members" && url.searchParams.has("email")) {
    // search by email, case-insensitive: without an index on lower(email) this reads the whole table
    const r = await query(req, "SELECT id, email, first_name, last_name FROM members WHERE lower(email) = lower($1)", [url.searchParams.get("email")]);
    return json(res, r.rowCount ? 200 : 404, r.rows[0] ?? null);
  }
  if ((m = url.pathname.match(/^\/members\/(\d+)$/))) {
    const r = await query(req, "SELECT m.id, m.email, m.first_name, m.last_name, e.name AS employer FROM members m JOIN employers e ON e.id = m.employer_id WHERE m.id = $1", [Number(m[1])]);
    return json(res, r.rowCount ? 200 : 404, r.rows[0] ?? null);
  }
  if ((m = url.pathname.match(/^\/members\/(\d+)\/statement$/))) {
    // the annual statement: pg_sleep stands for the ~40 ms contribution-history query, holding a connection meanwhile
    const r = await query(req, `SELECT id, balance, pg_sleep(${SERVICE_MS / 1000})::text FROM members WHERE id = $1`, [Number(m[1])]);
    return json(res, r.rowCount ? 200 : 404, r.rows[0] ? { id: r.rows[0].id, balance: r.rows[0].balance } : null);
  }
  return json(res, 404, null);
}

const server = http.createServer(async (req, res) => {
  inflight++;
  try {
    await route(req, new URL(req.url ?? "/", `http://localhost:${PORT}`), res);
    served++;
  } catch (e) {
    if (e instanceof ClientGone) {
      abandoned++;
      return;
    }
    errors++;
    json(res, 500, { error: String(e) });
  } finally {
    inflight--;
  }
});
server.keepAliveTimeout = 30_000;
server.listen(PORT, () => console.log(`   [server] member API on :${PORT}`));
process.on("SIGTERM", () => {
  server.closeAllConnections();
  server.close(async () => {
    await db.end();
    process.exit(0);
  });
});
