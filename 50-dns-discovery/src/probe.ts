// A client service inside the Compose network. It holds the four clients from clients.ts (their caches live as long
// as this process) and runs experiments on request from the demo, which runs on the host and cannot use Docker's DNS.
import { promises as dns } from "node:dns";
import { createServer } from "node:http";
import { type Client, type Outcome, SERVICE, cached, fresh, pinned, resilient } from "./clients.js";
import { CACHE_MS, PROBE_PORT, type RunResult } from "./config.js";
import { srvGet, srvResolver } from "./srv.js";

const clients = new Map<string, Client>([pinned(), fresh(), cached(CACHE_MS), resilient(CACHE_MS)].map((c) => [c.name, c]));

async function run(client: Client, n: number): Promise<RunResult> {
  const byIp: Record<string, number> = {};
  const errors: Record<string, number> = {};
  const times: number[] = [];
  let retried = 0;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    let o: Outcome;
    try {
      o = await client.get();
    } catch (err) {
      o = { ok: false, ip: "", error: (err as NodeJS.ErrnoException).code ?? String(err), ms: 0, attempts: 1 };
    }
    times.push(o.ms);
    if (o.attempts > 1) retried++;
    if (o.ok) byIp[o.ip] = (byIp[o.ip] ?? 0) + 1;
    else errors[`${o.error}${o.ip ? ` (${o.ip})` : ""}`] = (errors[`${o.error}${o.ip ? ` (${o.ip})` : ""}`] ?? 0) + 1;
  }
  times.sort((a, b) => a - b);
  return {
    client: client.name, how: client.how, sent: n, byIp, errors, retried,
    p50: Math.round(times[Math.floor(times.length / 2)]), max: Math.round(times[times.length - 1]), ms: Math.round(performance.now() - t0),
  };
}

const json = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://probe");
  const q = (k: string) => url.searchParams.get(k) ?? "";
  try {
    if (url.pathname === "/health") return json(res, 200, { ok: true });
    if (url.pathname === "/clients") return json(res, 200, [...clients.values()].map((c) => ({ name: c.name, how: c.how })));
    if (url.pathname === "/resolve") {
      // ttl: true returns the TTL the server sent with each record
      const a = await dns.resolve4(q("name") || SERVICE, { ttl: true });
      return json(res, 200, a.sort((x, y) => x.address.localeCompare(y.address, undefined, { numeric: true })));
    }
    if (url.pathname === "/forget") {
      for (const c of clients.values()) c.forget?.();
      return json(res, 200, { ok: true });
    }
    if (url.pathname === "/run") {
      const c = clients.get(q("client"));
      if (!c) return json(res, 404, { error: `no client ${q("client")}` });
      return json(res, 200, await run(c, Number(q("n") || 100)));
    }
    if (url.pathname === "/srv") return json(res, 200, await (await srvResolver()).resolveSrv(q("name")));
    if (url.pathname === "/srv-run") {
      const counts: Record<string, number> = {};
      const paths: Record<string, number> = {};
      const n = Number(q("n") || 100);
      for (let i = 0; i < n; i++) {
        const r = await srvGet(q("name"));
        const key = r.ok ? r.target : "failed";
        counts[key] = (counts[key] ?? 0) + 1;
        const path = r.tried.join(" -> ");
        paths[path] = (paths[path] ?? 0) + 1;
      }
      return json(res, 200, { counts, paths });
    }
    json(res, 404, { error: "not found" });
  } catch (err) {
    json(res, 500, { error: (err as NodeJS.ErrnoException).code ?? String(err) });
  }
}).listen(PROBE_PORT, () => console.log(`[probe] on :${PROBE_PORT}`));
