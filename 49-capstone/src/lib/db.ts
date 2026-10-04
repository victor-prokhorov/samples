// The portal's connection to Postgres, as 37-authorization does it: log in as `app` (no table owned, no BYPASSRLS)
// and tell the database who the user is with transaction-local settings, so a pooled connection never keeps
// the previous user's identity and every query is filtered by the RLS policies in src/schema.sql.
import pg from "pg";
import { APP_URL } from "../config";
import type { User } from "./policy";

// One pool per server process; the global survives module reloads in `next dev`.
const g = globalThis as unknown as { appPool?: pg.Pool };
export const pool = (g.appPool ??= new pg.Pool({ connectionString: APP_URL, max: 5 }));

export async function setUser(c: pg.ClientBase, u: User) {
  await c.query(
    `SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true),
            set_config('app.org_id', $3, true), set_config('app.member_id', $4, true)`,
    [u.id, u.role, u.orgId ?? "", u.memberId ?? ""],
  );
}

export async function asUser<T>(p: pg.Pool, u: User, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await p.connect();
  try {
    await c.query("BEGIN");
    await setUser(c, u);
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export const db = <T>(u: User, fn: (c: pg.PoolClient) => Promise<T>) => asUser(pool, u, fn);

// 42501: insufficient_privilege, what Postgres raises when a row fails a policy's WITH CHECK.
export const isRlsRefusal = (e: unknown) => (e as { code?: string }).code === "42501";
