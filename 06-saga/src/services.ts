import { inventoryDb, paymentsDb, shippingDb, tx } from "./db.js";

export type Order = { sku: string; qty: number; amount: string; address: string };

export const inventory = {
  reserve: (sagaId: string, o: Order) =>
    tx(inventoryDb, async (c) => {
      const { rowCount } = await c.query("INSERT INTO reservations VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [sagaId, o.sku, o.qty]);
      if (!rowCount) return;
      const updated = await c.query("UPDATE stock SET available = available - $2 WHERE sku = $1 AND available >= $2", [o.sku, o.qty]);
      if (!updated.rowCount) throw new Error(`out of stock: ${o.sku}`);
    }),
  release: (sagaId: string) =>
    tx(inventoryDb, async (c) => {
      const { rows } = await c.query("DELETE FROM reservations WHERE saga_id = $1 RETURNING sku, qty", [sagaId]);
      if (rows[0]) await c.query("UPDATE stock SET available = available + $2 WHERE sku = $1", [rows[0].sku, rows[0].qty]);
    }),
};

export const payments = {
  charge: async (sagaId: string, o: Order) => {
    if (Number(o.amount) > 1000) throw new Error(`card declined for ${o.amount}`);
    await paymentsDb.query("INSERT INTO charges VALUES ($1, $2, 'charged') ON CONFLICT DO NOTHING", [sagaId, o.amount]);
  },
  refund: async (sagaId: string) => {
    await paymentsDb.query("UPDATE charges SET status = 'refunded' WHERE saga_id = $1 AND status = 'charged'", [sagaId]);
  },
};

export const shipping = {
  create: async (sagaId: string, o: Order) => {
    if (o.address === "nowhere") throw new Error(`address not deliverable: ${o.address}`);
    await shippingDb.query("INSERT INTO shipments VALUES ($1, $2) ON CONFLICT DO NOTHING", [sagaId, o.address]);
  },
};
