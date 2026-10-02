import pg from "pg";

const pools = new Map<string, pg.Pool>();

export function db(name: string) {
  const existing = pools.get(name);
  if (existing) return existing;
  const pool = new pg.Pool({ connectionString: `postgres://postgres:postgres@localhost:55448/${name}` });
  pools.set(name, pool);
  return pool;
}

export function closeAll() {
  return Promise.all([...pools.values()].map((p) => p.end()));
}

export async function tx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
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
