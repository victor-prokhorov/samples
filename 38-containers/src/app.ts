// The member portal API that goes into the image. Everything it needs comes from the environment at run time
// (12-factor config): the image is the same in every environment, only the variables change.
//   GET /healthz         liveness: the process answers. Never touches the database (restarting would not fix it).
//   GET /readyz          readiness: warmed up, not draining, and Postgres answers SELECT 1 within 2 s.
//   GET /api/members     a fast request (one query).
//   GET /api/statement   a slow request (?ms=600), like building a PDF: the one a careless shutdown cuts off.
// SIGTERM drains: readiness turns 503, the listener closes, in-flight requests finish, then the pool closes and the process exits 0.
import http from "node:http";
import pg from "pg";

const PORT = Number(process.env.PORT ?? 8080);
const COLOR = process.env.COLOR ?? "local";
const VERSION = process.env.APP_VERSION ?? "dev";
const WARMUP_MS = Number(process.env.WARMUP_MS ?? 0);
const DRAIN_TIMEOUT_MS = Number(process.env.DRAIN_TIMEOUT_MS ?? 10_000);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 2000,
  query_timeout: 2000,
});
pool.on("error", (err) => log(`pool error: ${err.message}`));

let warm = WARMUP_MS === 0;
let draining = false;
let inFlight = 0;

function log(msg: string) {
  console.log(`${new Date().toISOString()} [${COLOR} ${VERSION}] ${msg}`);
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "x-color": COLOR,
    "x-version": VERSION,
    // While draining, tell keep-alive clients not to reuse this connection.
    ...(draining ? { connection: "close" } : {}),
  });
  res.end(JSON.stringify(body));
}

async function dbAnswers(): Promise<string | null> {
  try {
    await pool.query("SELECT 1");
    return null;
  } catch (err) {
    return `database: ${(err as Error).message}`;
  }
}

const server = http.createServer(async (req, res) => {
  inFlight++;
  res.on("close", () => inFlight--);
  const url = new URL(req.url ?? "/", "http://app");
  try {
    if (url.pathname === "/healthz") return send(res, 200, { status: "alive", color: COLOR, version: VERSION });
    if (url.pathname === "/readyz") {
      const reason = draining ? "draining" : !warm ? "warming up" : await dbAnswers();
      return send(res, reason ? 503 : 200, reason ? { ready: false, reason } : { ready: true, color: COLOR, version: VERSION });
    }
    if (!warm) return send(res, 503, { error: "warming up" });
    if (url.pathname === "/api/members") {
      const { rows } = await pool.query("SELECT employer, count(*)::int AS members FROM members GROUP BY employer ORDER BY employer");
      return send(res, 200, { color: COLOR, version: VERSION, employers: rows });
    }
    if (url.pathname === "/api/statement") {
      const ms = Math.min(Number(url.searchParams.get("ms") ?? 600), 10_000);
      await new Promise((r) => setTimeout(r, ms));
      const { rows } = await pool.query("SELECT count(*)::int AS members FROM members");
      return send(res, 200, { color: COLOR, version: VERSION, statement: `members=${rows[0].members}`, tookMs: ms });
    }
    return send(res, 404, { error: "not found" });
  } catch (err) {
    log(`500 ${url.pathname}: ${(err as Error).message}`);
    return send(res, 500, { error: "internal error" });
  }
});

server.listen(PORT, () => {
  log(`listening on :${PORT}, node ${process.version}, uid ${process.getuid?.()}${WARMUP_MS ? `, warming up for ${WARMUP_MS} ms` : ""}`);
  if (!warm)
    setTimeout(() => {
      warm = true;
      log("warm: caches loaded, /readyz can answer 200");
    }, WARMUP_MS);
});

function shutdown(signal: string) {
  if (draining) return;
  draining = true;
  log(`${signal}: draining, ${inFlight} request(s) in flight, /readyz now 503, no new connections`);
  const started = Date.now();
  // close() stops accepting connections and calls back once every open connection has ended;
  // closeIdleConnections() drops idle keep-alive sockets now so they do not hold the close open.
  server.close(async () => {
    await pool.end();
    log(`drained in ${Date.now() - started} ms, pool closed, exit 0`);
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => {
    log(`drain timeout after ${DRAIN_TIMEOUT_MS} ms with ${inFlight} request(s) left, exit 1`);
    process.exit(1);
  }, DRAIN_TIMEOUT_MS).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
