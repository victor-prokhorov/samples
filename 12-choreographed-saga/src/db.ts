import pg from "pg";

const url = (db: string) => `postgres://postgres:postgres@localhost:55446/${db}`;

export const ordersDb = new pg.Pool({ connectionString: url("orders") });
export const inventoryDb = new pg.Pool({ connectionString: url("inventory") });
export const paymentsDb = new pg.Pool({ connectionString: url("payments") });
export const shippingDb = new pg.Pool({ connectionString: url("shipping") });

export const adminDb = new pg.Pool({ connectionString: url("postgres") });

export function closeAll() {
  return Promise.all([ordersDb, inventoryDb, paymentsDb, shippingDb, adminDb].map((p) => p.end()));
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
