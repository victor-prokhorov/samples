import pg from "pg";
import { asTenant, pool } from "./db.js";

export type Route = { tenant: string; db: string; moving: boolean; timeoutMs: number; pool: pg.Pool };

const directory = pool("app", "pool");

const byDb = new Map<string, pg.Pool>([["pool", directory]]);

export async function route(tenant: string): Promise<Route> {
  const { rows } = await directory.query("SELECT db, moving, statement_timeout_ms FROM tenants WHERE id = $1", [tenant]);
  if (!rows.length) throw new Error(`unknown tenant ${tenant}`);
  const db: string = rows[0].db;
  const p = byDb.get(db) ?? pool("app", db, 5);
  byDb.set(db, p);
  return { tenant, db, moving: rows[0].moving, timeoutMs: rows[0].statement_timeout_ms, pool: p };
}

export async function read<T>(tenant: string, fn: (c: pg.PoolClient, r: Route) => Promise<T>): Promise<T> {
  const r = await route(tenant);
  return asTenant(r.pool, tenant, (c) => fn(c, r));
}

export async function write<T>(tenant: string, fn: (c: pg.PoolClient, r: Route) => Promise<T>): Promise<T> {
  const r = await route(tenant);
  if (r.moving) throw new Error(`${tenant} is being moved: writes paused, reads still served by ${r.db}`);
  return asTenant(r.pool, tenant, (c) => fn(c, r));
}

export async function forget(db: string) {
  const p = byDb.get(db);
  byDb.delete(db);
  if (p && p !== directory) await p.end();
}
