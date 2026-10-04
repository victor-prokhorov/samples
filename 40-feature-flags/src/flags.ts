// The flag client: evaluates flags locally from a short-lived cache, and drops a cached flag the moment
// Postgres says it changed (LISTEN flags_changed). The method names follow OpenFeature's client API
// (getBooleanValue(key, default, context) with a targetingKey), so swapping this for an OpenFeature provider
// keeps the call sites.
import { createHash } from "node:crypto";
import pg from "pg";
import { DATABASE_URL } from "./db.js";

export type Context = { targetingKey?: string; tenant?: string };

export type FlagRow = { key: string; kind: string; enabled: boolean; percentage: number; tenants: string[]; version: number };

// A number 0..9999 that depends only on the flag and the member: the same member lands in the same bucket on every
// server and every request, and raising the percentage only adds buckets, so nobody who had the feature loses it.
// The flag key is part of the input, so each flag picks a different 1% of members.
export function bucket(flagKey: string, targetingKey: string): number {
  return createHash("sha256").update(`${flagKey}:${targetingKey}`).digest().readUInt32BE(0) % 10000;
}

export function evaluate(flag: FlagRow | null, ctx: Context, defaultValue: boolean): boolean {
  if (!flag) return defaultValue;
  if (!flag.enabled) return false;
  switch (flag.kind) {
    case "release":
    case "kill":
      return true;
    case "percentage":
      return ctx.targetingKey !== undefined && bucket(flag.key, ctx.targetingKey) < flag.percentage * 100;
    case "tenant":
      return ctx.tenant !== undefined && flag.tenants.includes(ctx.tenant);
    default:
      return defaultValue;
  }
}

export class FlagClient {
  private cache = new Map<string, { row: FlagRow | null; at: number }>();
  private listener?: pg.Client;
  readonly stats = { evaluations: 0, reads: 0, invalidations: 0 };
  onInvalidate?: (key: string) => void;

  constructor(
    private pool: pg.Pool,
    readonly opts: { ttlMs: number; listen: boolean },
  ) {}

  async start() {
    if (!this.opts.listen) return this;
    this.listener = new pg.Client({ connectionString: DATABASE_URL });
    this.listener.on("notification", (msg) => {
      if (!msg.payload) return;
      this.cache.delete(msg.payload);
      this.stats.invalidations++;
      this.onInvalidate?.(msg.payload);
    });
    // a lost connection means lost notifications: forget everything and let the TTL carry us until reconnect
    this.listener.on("error", () => this.cache.clear());
    await this.listener.connect();
    await this.listener.query("LISTEN flags_changed");
    return this;
  }

  async stop() {
    await this.listener?.end();
  }

  private async load(key: string): Promise<FlagRow | null> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.opts.ttlMs) return hit.row;
    this.stats.reads++;
    try {
      const r = await this.pool.query<FlagRow>("SELECT key, kind, enabled, percentage, tenants, version FROM flags WHERE key = $1", [key]);
      const row = r.rows[0] ?? null;
      this.cache.set(key, { row, at: Date.now() });
      return row;
    } catch (e) {
      // flag store down: keep serving the last known value rather than flipping every flag to its default
      if (hit) return hit.row;
      throw e;
    }
  }

  async getBooleanValue(key: string, defaultValue: boolean, ctx: Context = {}): Promise<boolean> {
    this.stats.evaluations++;
    return evaluate(await this.load(key), ctx, defaultValue);
  }

  cached(): string[] {
    return [...this.cache.keys()].sort();
  }
}

// The only write path: one transaction that names the actor and the reason; the trigger audits and notifies.
export async function setFlag(pool: pg.Pool, key: string, patch: Partial<Pick<FlagRow, "enabled" | "percentage" | "tenants">>, actor: string, reason: string) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.actor', $1, true), set_config('app.reason', $2, true)", [actor, reason]);
    const cols = Object.keys(patch);
    const sets = cols.map((col, i) => `${col} = $${i + 2}`).join(", ");
    const r = await c.query(`UPDATE flags SET ${sets} WHERE key = $1 RETURNING version`, [key, ...cols.map((col) => patch[col as keyof typeof patch])]);
    if (r.rowCount !== 1) throw new Error(`unknown flag ${key}`);
    await c.query("COMMIT");
    return r.rows[0].version as number;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
