// The limiter in front of every request: a token bucket per tenant and per API key, decided by one call to
// take_tokens() in Postgres, plus a local memory of recent refusals so a client that hammers is answered without
// another database round trip until its bucket can hold a token again.
import type pg from "pg";

export type Policy = { name: "tenant" | "key"; bucket: string; rate: number; burst: number };
export type Decision = { allowed: boolean; headers: Record<string, string>; source: "db" | "local" };

const denyUntil = new Map<string, number>();

// IETF draft-ietf-httpapi-ratelimit-headers: RateLimit-Policy names each quota (q units per w seconds);
// RateLimit says what is left (r) and in how many seconds the quota is back (t). A token bucket's policy is its
// sustained rate (q units per w = 1 second); the burst is the most r can be.
function headers(policies: Policy[], remaining: number[], waits: number[], allowed: boolean) {
  const h: Record<string, string> = {
    "RateLimit-Policy": policies.map((p) => `"${p.name}";q=${p.rate};w=1`).join(", "),
    RateLimit: policies
      .map((p, i) => {
        const r = Math.max(0, Math.floor(remaining[i]));
        const t = Math.max(r === 0 ? 1 : 0, Math.ceil((p.burst - remaining[i]) / p.rate));
        return `"${p.name}";r=${r};t=${t}`;
      })
      .join(", "),
  };
  if (!allowed) h["Retry-After"] = String(Math.max(1, Math.ceil(Math.max(...waits))));
  return h;
}

// One take_tokens() call per tenant at a time in this process. The row lock would serialize them anyway; waiting here
// keeps a noisy tenant's requests in memory instead of each holding one of the limiter's connections while it waits
// for the lock, which would make every other tenant queue for a connection.
const lanes = new Map<string, Promise<unknown>>();
function inLane<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const next = (lanes.get(key) ?? Promise.resolve()).then(fn, fn);
  lanes.set(key, next.catch(() => undefined));
  return next;
}

export function limit(db: pg.Pool, policies: Policy[]): Promise<Decision> {
  return inLane(policies[0].bucket, () => decide(db, policies));
}

async function decide(db: pg.Pool, policies: Policy[]): Promise<Decision> {
  const now = Date.now();
  const local = policies.map((p) => Math.max(0, (denyUntil.get(p.bucket) ?? 0) - now) / 1000);
  if (local.some((w) => w > 0)) {
    return { allowed: false, source: "local", headers: headers(policies, policies.map(() => 0), local, false) };
  }
  const r = await db.query<{ allowed: boolean; remaining: number[]; wait: number[] }>("SELECT * FROM take_tokens($1, $2, $3)", [
    policies.map((p) => p.bucket),
    policies.map((p) => p.burst),
    policies.map((p) => p.rate),
  ]);
  const { allowed, remaining, wait } = r.rows[0];
  if (!allowed) policies.forEach((p, i) => wait[i] > 0 && denyUntil.set(p.bucket, now + wait[i] * 1000));
  return { allowed, source: "db", headers: headers(policies, remaining, wait, allowed) };
}
