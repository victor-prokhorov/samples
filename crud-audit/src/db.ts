import pg from "pg";

export const pool = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:55434/postgres" });

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      price NUMERIC(10, 2) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGSERIAL PRIMARY KEY,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
      actor TEXT NOT NULL CHECK (actor <> ''),
      before JSONB,
      after JSONB,
      at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
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
