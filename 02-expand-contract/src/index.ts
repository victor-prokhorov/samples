import pg from "pg";
import { AppVersion, v1, v2, v3, v4 } from "./versions.js";
import { check } from "./check.js";

const db = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:55438/postgres" });

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

async function migrate(label: string, sql: string) {
  await db.query(sql);
  console.log(`   migration ${label}: ${sql.replace(/\s+/g, " ").trim()}`);
}

// Each running version writes a row and reads them all back. "ok" means the write worked and every row read has a name.
async function exercise(running: AppVersion[], phase: string) {
  const ok: boolean[] = [];
  for (const app of running) {
    try {
      await app.create(db, `${phase}-${app.label.slice(0, 2)}`);
      const all = await app.list(db);
      const missing = all.filter((n) => n === null).length;
      console.log(`   ${app.label}: write ok, read ${all.length} rows, ${missing === 0 ? "all have a name" : `${missing} rows WITHOUT a name`}`);
      ok.push(missing === 0);
    } catch (err) {
      console.log(`   ${app.label}: FAILS: ${err instanceof Error ? err.message : String(err)}`);
      ok.push(false);
    }
  }
  return ok;
}

async function works(running: AppVersion[], phase: string) {
  const ok = await exercise(running, phase);
  const names = running.map((a) => a.label.split(" ")[0]).join(" and ");
  check(`${names} ${running.length > 1 ? "each write" : "writes"} and read${running.length > 1 ? "" : "s"} a name for every row`, ok.every(Boolean));
}

async function probe(app: AppVersion) {
  const missing = (await app.list(db)).filter((n) => n === null).length;
  console.log(`   probe ${app.label}: ${missing} rows WITHOUT a name`);
  return missing;
}

async function main() {
  await db.query("DROP TABLE IF EXISTS users; CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL)");
  step("0. Starting point", "schema has users.name, v1 runs in production");
  await works([v1], "p0");
  step("Naive: rename in one step", "RENAME breaks every running instance the moment it commits; a rolling deploy always has old code running");
  await migrate("naive", "ALTER TABLE users RENAME COLUMN name TO display_name");
  check("the naive rename breaks the running v1 the moment it commits", (await exercise([v1], "naive"))[0] === false);
  await migrate("undo", "ALTER TABLE users RENAME COLUMN display_name TO name");
  step("1. Expand", "only additive, backward-compatible changes: add the new column, relax NOT NULL on the old one; v1 and v2 run side by side");
  await migrate("M1", "ALTER TABLE users ADD COLUMN display_name TEXT, ALTER COLUMN name DROP NOT NULL");
  await works([v1, v2], "p1");
  console.log("   too early: reading the new column before the backfill would show blanks");
  check("before the backfill, a reader of display_name sees rows without a name", (await probe(v3)) > 0);
  step("2. Migrate data", "v1 is fully retired, so every writer now fills both columns; backfill the old rows");
  await migrate("M2", "UPDATE users SET display_name = name WHERE display_name IS NULL");
  await works([v2], "p2");
  step("3. Switch reads", "deploy v3 which reads the new column; v2 and v3 overlap during the rollout");
  await works([v2, v3], "p3");
  step("4. Stop writing the old column", "all writers fill display_name and the backfill is done, so it can become NOT NULL; deploy v4, overlapping with v3");
  await migrate("M3", "ALTER TABLE users ALTER COLUMN display_name SET NOT NULL");
  await works([v3, v4], "p4");
  step("5. Contract", "v3 is fully retired, nobody reads or writes name any more: drop it");
  await migrate("M4", "ALTER TABLE users DROP COLUMN name");
  await works([v4], "p5");
  step("Why the order matters", "had v3 still been running, the contract step would have broken it");
  check("contracting while v3 still ran would have broken it", (await exercise([v3], "late"))[0] === false);
  const cols = await db.query("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position");
  check("the final schema has only id and display_name, NOT NULL", cols.rows.map((c) => `${c.column_name}:${c.is_nullable}`).join(",") === "id:NO,display_name:NO");
  const rows = await db.query("SELECT count(*)::int AS n, count(display_name)::int AS named FROM users");
  check("every row written by every version in every phase has a display_name (9 rows)", rows.rows[0].n === 9 && rows.rows[0].named === 9);
  await db.end();
}

main();
