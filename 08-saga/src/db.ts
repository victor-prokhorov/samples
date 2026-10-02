import pg from "pg";

const url = (db: string) => `postgres://postgres:postgres@localhost:55439/${db}`;

export const inventoryDb = new pg.Pool({ connectionString: url("inventory") });
export const paymentsDb = new pg.Pool({ connectionString: url("payments") });
export const shippingDb = new pg.Pool({ connectionString: url("shipping") });
export const orchestratorDb = new pg.Pool({ connectionString: url("orchestrator") });

export const adminDb = new pg.Pool({ connectionString: url("postgres") });

export function closeAll() {
  return Promise.all([inventoryDb, paymentsDb, shippingDb, orchestratorDb, adminDb].map((p) => p.end()));
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
