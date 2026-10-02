import pg from "pg";

export const url = "postgres://postgres:postgres@localhost:55449/postgres";

export const db = new pg.Pool({ connectionString: url });

export const clock = () => new Date().toISOString().slice(11, 19);

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
