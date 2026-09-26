import pg from "pg";
import { AppVersion, v1, v2, v3, v4 } from "./versions.js";

const db = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:55438/postgres" });

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

async function migrate(label: string, sql: string) {
  await db.query(sql);
  console.log(`   migration ${label}: ${sql.replace(/\s+/g, " ").trim()}`);
}

async function check(running: AppVersion[], phase: string) {
  for (const app of running) {
    try {
      await app.create(db, `${phase}-${app.label.slice(0, 2)}`);
      const all = await app.list(db);
      const missing = all.filter((n) => n === null).length;
      console.log(`   ${app.label}: write ok, read ${all.length} rows, ${missing === 0 ? "all have a name" : `${missing} rows WITHOUT a name`}`);
    } catch (err) {
      console.log(`   ${app.label}: FAILS: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function probe(app: AppVersion) {
  const missing = (await app.list(db)).filter((n) => n === null).length;
  console.log(`   probe ${app.label}: ${missing} rows WITHOUT a name`);
}

async function main() {
  await db.query("DROP TABLE IF EXISTS users; CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL)");
  step("0. Starting point", "schema has users.name, v1 runs in production");
  await check([v1], "p0");
  step("Naive: rename in one step", "RENAME breaks every running instance the moment it commits; a rolling deploy always has old code running");
  await migrate("naive", "ALTER TABLE users RENAME COLUMN name TO display_name");
  await check([v1], "naive");
  await migrate("undo", "ALTER TABLE users RENAME COLUMN display_name TO name");
  step("1. Expand", "only additive, backward-compatible changes: add the new column, relax NOT NULL on the old one; v1 and v2 run side by side");
  await migrate("M1", "ALTER TABLE users ADD COLUMN display_name TEXT, ALTER COLUMN name DROP NOT NULL");
  await check([v1, v2], "p1");
  console.log("   too early: reading the new column before the backfill would show blanks");
  await probe(v3);
  step("2. Migrate data", "v1 is fully retired, so every writer now fills both columns; backfill the old rows");
  await migrate("M2", "UPDATE users SET display_name = name WHERE display_name IS NULL");
  await check([v2], "p2");
  step("3. Switch reads", "deploy v3 which reads the new column; v2 and v3 overlap during the rollout");
  await check([v2, v3], "p3");
  step("4. Stop writing the old column", "all writers fill display_name and the backfill is done, so it can become NOT NULL; deploy v4, overlapping with v3");
  await migrate("M3", "ALTER TABLE users ALTER COLUMN display_name SET NOT NULL");
  await check([v3, v4], "p4");
  step("5. Contract", "v3 is fully retired, nobody reads or writes name any more: drop it");
  await migrate("M4", "ALTER TABLE users DROP COLUMN name");
  await check([v4], "p5");
  step("Why the order matters", "had v3 still been running, the contract step would have broken it");
  await check([v3], "late");
  await db.end();
}

main();
