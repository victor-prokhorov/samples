// Four ways for a client to find the replicas of a service by name. All four only know "catalog:8080";
// none has an IP address in its config. They differ in when they ask DNS and what they do when an address fails.
import { promises as dns } from "node:dns";
import http from "node:http";

export type Hit = { ok: true; ip: string; replica: string; ms: number; attempts: number };
export type Miss = { ok: false; ip: string; error: string; ms: number; attempts: number };
export type Outcome = Hit | Miss;

export interface Client {
  name: string;
  how: string;
  get(): Promise<Outcome>;
  // drop the cached answer, so the next request asks DNS again (the demo uses it to start a step from a known cache)
  forget?(): void;
}

export const SERVICE = "catalog";
export const PORT = 8080;

// One GET to host:port, with a deadline: a replica that does not answer in time is a failure, not a hang.
export function get(host: string, port: number, opts: { timeoutMs: number; agent?: http.Agent | false }): Promise<{ ip: string; replica: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host, port, path: "/", agent: opts.agent ?? false, timeout: opts.timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          const { replica, ip } = JSON.parse(body) as { replica: string; ip: string };
          resolve({ ip, replica });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error(`timeout after ${opts.timeoutMs} ms`)));
    req.on("error", reject);
  });
}

const errorText = (err: unknown) => {
  const e = err as NodeJS.ErrnoException;
  return e?.code ?? (e instanceof Error ? e.message : String(err));
};

async function attempt(host: string, port: number, opts: { timeoutMs: number; agent?: http.Agent | false }, attempts = 1): Promise<Outcome> {
  const t0 = performance.now();
  try {
    const r = await get(host, port, opts);
    return { ok: true, ...r, ms: performance.now() - t0, attempts };
  } catch (err) {
    return { ok: false, ip: host, error: errorText(err), ms: performance.now() - t0, attempts };
  }
}

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

// 1. What most code does: an HTTP client with keep-alive on "catalog:8080". The name is looked up (getaddrinfo) only
// when a connection opens; every later request reuses that connection, so they all land on one replica.
export function pinned(): Client {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  return {
    name: "pinned",
    how: "keep-alive connection to catalog:8080 (one lookup per connection)",
    get: () => attempt(SERVICE, PORT, { timeoutMs: 1000, agent }),
  };
}

// 2. Ask DNS on every request and pick one of the answers at random: client-side load balancing, always current.
export function fresh(): Client {
  return {
    name: "fresh",
    how: "resolve4(catalog) on every request, random pick, new connection",
    get: async () => {
      const ips = await dns.resolve4(SERVICE);
      return attempt(pick(ips), PORT, { timeoutMs: 1000 });
    },
  };
}

// A cached answer, as every resolver library, OS and runtime keeps one (the JVM once kept it forever).
class Cached {
  ips: string[] = [];
  until = 0;
  constructor(readonly ttlMs: number) {}
  async get() {
    if (Date.now() >= this.until || this.ips.length === 0) {
      this.ips = await dns.resolve4(SERVICE);
      this.until = Date.now() + this.ttlMs;
    }
    return this.ips;
  }
  forget() {
    this.until = 0;
  }
  drop(ip: string) {
    this.ips = this.ips.filter((x) => x !== ip);
  }
}

// 3. Cache the answer for a while and trust it: cheap, but blind to replicas that left until the cache expires.
export function cached(ttlMs: number): Client {
  const cache = new Cached(ttlMs);
  return {
    name: "cached",
    how: `answer cached ${ttlMs / 1000} s, random pick, 500 ms timeout, no retry`,
    get: async () => attempt(pick(await cache.get()), PORT, { timeoutMs: 500 }),
    forget: () => cache.forget(),
  };
}

// 4. The same cache, plus what DNS cannot give: a short timeout, and on failure drop that address and try another.
// This is passive health checking (outlier ejection) done by the client; a load balancer or a mesh sidecar does it for you.
export function resilient(ttlMs: number): Client {
  const cache = new Cached(ttlMs);
  return {
    name: "resilient",
    how: `answer cached ${ttlMs / 1000} s, 300 ms timeout, on failure drop the address and retry another (3 attempts)`,
    get: async () => {
      let last: Outcome | undefined;
      const t0 = performance.now();
      for (let i = 1; i <= 3; i++) {
        const ips = await cache.get();
        const ip = pick(ips);
        last = await attempt(ip, PORT, { timeoutMs: 300 }, i);
        if (last.ok) return { ...last, ms: performance.now() - t0 };
        cache.drop(ip);
      }
      return { ...last!, ms: performance.now() - t0 };
    },
    forget: () => cache.forget(),
  };
}
