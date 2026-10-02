import pg from "pg";
import { billingDb, ordersDb, tx } from "./db.js";

type AuditEntry = { entity: string; entityId: string | number; action: string; actor: string; reason: string; before: object | null; after: object | null };

async function audit(c: pg.PoolClient, e: AuditEntry) {
  const { rows } = await c.query(
    "INSERT INTO audit_outbox (entity, entity_id, action, actor, reason, before, after) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING event_id",
    [e.entity, String(e.entityId), e.action, e.actor, e.reason, e.before, e.after],
  );
  console.log(`      audit_outbox <- ${e.entity} ${e.entityId} ${e.action} by ${e.actor} (${e.reason}) event_id=${rows[0].event_id}`);
}

export const orders = {
  place: (actor: string, reason: string, customer: string, total: string) =>
    tx(ordersDb, async (c) => {
      const { rows } = await c.query("INSERT INTO orders (customer, total) VALUES ($1, $2) RETURNING id, customer, total", [customer, total]);
      await audit(c, { entity: "order", entityId: rows[0].id, action: "create", actor, reason, before: null, after: rows[0] });
      return rows[0].id as number;
    }),
  changeTotal: (actor: string, reason: string, id: number, total: string, failAfterWrite = false) =>
    tx(ordersDb, async (c) => {
      const before = await c.query("SELECT id, customer, total FROM orders WHERE id = $1 FOR UPDATE", [id]);
      const after = await c.query("UPDATE orders SET total = $2 WHERE id = $1 RETURNING id, customer, total", [id, total]);
      await audit(c, { entity: "order", entityId: id, action: "update", actor, reason, before: before.rows[0], after: after.rows[0] });
      if (failAfterWrite) throw new Error(`discount service down, change to order ${id} aborted`);
    }),
};

export const billing = {
  invoice: (actor: string, reason: string, orderId: number, amount: string) =>
    tx(billingDb, async (c) => {
      const { rows } = await c.query("INSERT INTO invoices (order_id, amount) VALUES ($1, $2) RETURNING id, order_id, amount", [orderId, amount]);
      await audit(c, { entity: "invoice", entityId: rows[0].id, action: "create", actor, reason, before: null, after: rows[0] });
    }),
};
