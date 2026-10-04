import pg from "pg";

const url = (db: string) => `postgres://postgres:postgres@localhost:55446/${db}`;

export const ordersDb = new pg.Pool({ connectionString: url("orders") });
export const inventoryDb = new pg.Pool({ connectionString: url("inventory") });
export const paymentsDb = new pg.Pool({ connectionString: url("payments") });
export const shippingDb = new pg.Pool({ connectionString: url("shipping") });

export const adminDb = new pg.Pool({ connectionString: url("postgres") });

const values = async (pool: pg.Pool, sql: string) => (await pool.query(sql)).rows.map((r) => Object.values(r).join(":")).join(", ");

// What every service holds right now, one line per service, for checks before and after a saga.
export async function balances() {
  return {
    orders: await values(ordersDb, "SELECT id, status FROM orders ORDER BY id"),
    stock: await values(inventoryDb, "SELECT available FROM stock"),
    reservations: await values(inventoryDb, "SELECT order_id, qty FROM reservations ORDER BY order_id"),
    charges: await values(paymentsDb, "SELECT order_id, amount, status FROM charges ORDER BY order_id"),
    shipments: await values(shippingDb, "SELECT order_id FROM shipments ORDER BY order_id"),
  };
}

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
