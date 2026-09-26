import pg from "pg";
import { pool, tx } from "./db.js";

export type Product = { id: number; name: string; price: string };

async function audit(c: pg.PoolClient, actor: string, action: string, id: number, before: Product | null, after: Product | null) {
  await c.query("INSERT INTO audit_log (entity, entity_id, action, actor, before, after) VALUES ('product', $1, $2, $3, $4, $5)", [
    String(id),
    action,
    actor,
    before,
    after,
  ]);
}

export function createProduct(actor: string, input: Omit<Product, "id">) {
  return tx(async (c) => {
    const { rows } = await c.query<Product>("INSERT INTO products (name, price) VALUES ($1, $2) RETURNING *", [input.name, input.price]);
    await audit(c, actor, "create", rows[0].id, null, rows[0]);
    return rows[0];
  });
}

export async function getProduct(id: number) {
  const { rows } = await pool.query<Product>("SELECT * FROM products WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export function updateProduct(actor: string, id: number, patch: Partial<Omit<Product, "id">>) {
  return tx(async (c) => {
    const before = (await c.query<Product>("SELECT * FROM products WHERE id = $1 FOR UPDATE", [id])).rows[0];
    if (!before) throw new Error(`product ${id} not found`);
    const { rows } = await c.query<Product>("UPDATE products SET name = $2, price = $3 WHERE id = $1 RETURNING *", [
      id,
      patch.name ?? before.name,
      patch.price ?? before.price,
    ]);
    await audit(c, actor, "update", id, before, rows[0]);
    return rows[0];
  });
}

export function deleteProduct(actor: string, id: number) {
  return tx(async (c) => {
    const { rows } = await c.query<Product>("DELETE FROM products WHERE id = $1 RETURNING *", [id]);
    if (!rows[0]) throw new Error(`product ${id} not found`);
    await audit(c, actor, "delete", id, rows[0], null);
  });
}

export async function history(id: number) {
  const { rows } = await pool.query("SELECT action, actor, before, after, at FROM audit_log WHERE entity = 'product' AND entity_id = $1 ORDER BY id", [
    String(id),
  ]);
  return rows;
}
