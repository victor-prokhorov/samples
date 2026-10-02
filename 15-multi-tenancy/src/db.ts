import pg from "pg";

export type User = "postgres" | "migrator" | "app";

const opened: pg.Pool[] = [];

export function pool(user: User, database: string, max = 10) {
  const p = new pg.Pool({ connectionString: `postgres://${user}:${user}@localhost:55447/${database}`, max });
  opened.push(p);
  return p;
}

export function closeAll() {
  return Promise.all(opened.filter((p) => !p.ended).map((p) => p.end()));
}

export async function tx<T>(p: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export function asTenant<T>(p: pg.Pool, tenant: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  return tx(p, async (c) => {
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
    return fn(c);
  });
}

export function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

export function reason(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return err instanceof pg.DatabaseError && err.detail ? `${message} (${err.detail})` : message;
}

export async function rejection(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    return reason(err);
  }
  throw new Error("expected a rejection, but the operation succeeded");
}
