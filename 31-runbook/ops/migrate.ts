// usage: migrate.ts up <n> | down <n> | status
import { readFile, readdir } from "node:fs/promises";
import { db } from "../src/db.js";

const [cmd, arg] = process.argv.slice(2);
await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
const applied = new Set((await db.query<{ version: number }>("SELECT version FROM schema_migrations")).rows.map((r) => r.version));
const files = (await readdir("migrations")).filter((f) => f.endsWith(".up.sql")).sort();
const migrations = files.map((f) => ({ version: Number(f.slice(0, 3)), name: f.replace(".up.sql", "") }));
const target = Number(arg);

async function apply(version: number, name: string, direction: "up" | "down") {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(await readFile(`migrations/${name}.${direction}.sql`, "utf8"));
    if (direction === "up") await client.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [version, name]);
    else await client.query("DELETE FROM schema_migrations WHERE version = $1", [version]);
    await client.query("COMMIT");
    console.log(`migrate ${direction} ${name}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

if (cmd === "up") {
  if (!migrations.some((m) => m.version === target)) throw new Error(`no migration ${target}`);
  for (const m of migrations) if (m.version <= target && !applied.has(m.version)) await apply(m.version, m.name, "up");
} else if (cmd === "down") {
  for (const m of [...migrations].reverse()) if (m.version > target && applied.has(m.version)) await apply(m.version, m.name, "down");
} else if (cmd !== "status") throw new Error("usage: migrate.ts up <n> | down <n> | status");
const { rows } = await db.query("SELECT coalesce(max(version), 0) AS v FROM schema_migrations");
console.log(`schema version ${rows[0].v}`);
await db.end();
