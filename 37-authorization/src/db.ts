// Two ways into Postgres (:55467). The owner sets up tables and test fixtures and bypasses RLS.
// The application logs in as `app`, which owns nothing and does not bypass RLS, and tells the database
// who the user is with transaction-local settings, so a pooled connection never keeps the last user's identity.
import pg from "pg";
import type { User } from "./policy.js";

export const OWNER_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:55467/postgres";
export const APP_URL = process.env.APP_DATABASE_URL ?? "postgres://app:app@localhost:55467/postgres";
export const PORT = Number(process.env.PORT ?? 53047);

// The same four facts the code's policy reads from User.
export async function setUser(c: pg.ClientBase, u: User) {
  await c.query(
    `SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true),
            set_config('app.org_id', $3, true), set_config('app.member_id', $4, true)`,
    [u.id, u.role, u.orgId ?? "", u.memberId ?? ""],
  );
}

export async function asUser<T>(pool: pg.Pool, u: User, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
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

// 42501: insufficient_privilege, what Postgres raises when a row fails a policy's WITH CHECK.
export const isRlsRefusal = (e: unknown) => (e as { code?: string }).code === "42501";
