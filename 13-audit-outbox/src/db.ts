import pg from "pg";

const url = (db: string) => `postgres://postgres:postgres@localhost:55444/${db}`;

export const ordersDb = new pg.Pool({ connectionString: url("orders") });
export const billingDb = new pg.Pool({ connectionString: url("billing") });
export const auditDb = new pg.Pool({ connectionString: url("audit") });
export const adminDb = new pg.Pool({ connectionString: url("postgres") });

export const SERVICES = [
  { name: "orders", db: ordersDb },
  { name: "billing", db: billingDb },
];

export function closeAll() {
  return Promise.all([ordersDb, billingDb, auditDb, adminDb].map((p) => p.end()));
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
