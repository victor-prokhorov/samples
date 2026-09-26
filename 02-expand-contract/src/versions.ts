import pg from "pg";

export type AppVersion = {
  label: string;
  create: (db: pg.Pool, name: string) => Promise<void>;
  list: (db: pg.Pool) => Promise<(string | null)[]>;
};

async function names(db: pg.Pool, column: string) {
  const { rows } = await db.query(`SELECT ${column} AS n FROM users ORDER BY id`);
  return rows.map((r) => r.n as string | null);
}

export const v1: AppVersion = {
  label: "v1 (write name, read name)",
  create: async (db, name) => void (await db.query("INSERT INTO users (name) VALUES ($1)", [name])),
  list: (db) => names(db, "name"),
};

export const v2: AppVersion = {
  label: "v2 (write both, read name)",
  create: async (db, name) => void (await db.query("INSERT INTO users (name, display_name) VALUES ($1, $1)", [name])),
  list: (db) => names(db, "name"),
};

export const v3: AppVersion = {
  label: "v3 (write both, read display_name)",
  create: async (db, name) => void (await db.query("INSERT INTO users (name, display_name) VALUES ($1, $1)", [name])),
  list: (db) => names(db, "display_name"),
};

export const v4: AppVersion = {
  label: "v4 (write display_name, read display_name)",
  create: async (db, name) => void (await db.query("INSERT INTO users (display_name) VALUES ($1)", [name])),
  list: (db) => names(db, "display_name"),
};
