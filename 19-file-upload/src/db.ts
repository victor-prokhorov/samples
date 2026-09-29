import pg from "pg";

export const url = "postgres://postgres:postgres@localhost:55450/postgres";

export const PORT = 53020;

export const db = new pg.Pool({ connectionString: url });

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
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
