// The member API shared by every employer. LIMITS=off serves whatever arrives; LIMITS=on puts the limiter in front.
import http from "node:http";
import { PORT, appDb, limiterDb } from "./db.js";
import { type Policy, limit } from "./limiter.js";

const limits = process.env.LIMITS !== "off";
const keys = new Map<string, Policy[]>();
const rows = await appDb.query(
  `SELECT k.key, k.tenant_id, k.rate AS key_rate, k.burst AS key_burst, t.rate AS tenant_rate, t.burst AS tenant_burst
   FROM api_keys k JOIN tenants t ON t.id = k.tenant_id`,
);
const tenantOf = new Map<string, string>();
for (const k of rows.rows) {
  tenantOf.set(k.key, k.tenant_id);
  keys.set(k.key, [
    { name: "tenant", bucket: `tenant:${k.tenant_id}`, rate: k.tenant_rate, burst: k.tenant_burst },
    { name: "key", bucket: `key:${k.key}`, rate: k.key_rate, burst: k.key_burst },
  ]);
}
const counts = { served: 0, refusedByDb: 0, refusedLocally: 0 };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/stats") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(counts));
  const m = url.pathname.match(/^\/members\/(\d+)$/);
  if (!m) return res.writeHead(404).end();
  const apiKey = String(req.headers["x-api-key"] ?? "");
  const policies = keys.get(apiKey);
  if (!policies) return res.writeHead(401).end();
  try {
    let extra: Record<string, string> = {};
    if (limits) {
      const d = await limit(limiterDb, policies);
      extra = d.headers;
      if (!d.allowed) {
        d.source === "db" ? counts.refusedByDb++ : counts.refusedLocally++;
        // RFC 9457 problem details, so a client can tell a rate limit from any other error
        return res
          .writeHead(429, { "content-type": "application/problem+json", ...extra })
          .end(JSON.stringify({ type: "about:blank", title: "Too Many Requests", status: 429, detail: `quota exceeded for ${apiKey}, retry after ${extra["Retry-After"]} s` }));
      }
    }
    // the real work: a member lookup that stands for a 20 ms query (contribution history), on the shared pool
    const r = await appDb.query("SELECT id, name, pg_sleep(0.02)::text FROM members WHERE id = $1 AND tenant_id = $2", [Number(m[1]), tenantOf.get(apiKey)]);
    counts.served++;
    res.writeHead(r.rowCount ? 200 : 404, { "content-type": "application/json", ...extra }).end(JSON.stringify(r.rows[0] ?? null));
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});
server.keepAliveTimeout = 30_000;
server.listen(PORT, () => console.log(`   [server] member API on :${PORT}, limits ${limits ? "ON" : "OFF"}`));
process.on("SIGTERM", () => {
  server.closeAllConnections();
  server.close(async () => {
    await appDb.end();
    await limiterDb.end();
    process.exit(0);
  });
});
