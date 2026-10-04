// Compares the live schema with the inventory. Any problem means an export could miss personal data, so the export
// refuses to run (fail closed), and CI runs this after migrations.
import type pg from "pg";
import { inventory, notPersonal } from "./inventory.js";

// names that suggest personal data in a table declared "not personal"
const LOOKS_PERSONAL = /(^|_)(member_id|user_id|person|email|phone|mobile|birth|address|postcode|ip|iban|national|ssn|notes?|message|body)(_|$)|(^|_)(given|family|first|last|full|preferred|display|holder)_name$/;

export async function checkInventory(db: pg.Pool): Promise<string[]> {
  const cols = await db.query(
    `SELECT c.table_name, c.column_name FROM information_schema.columns c
     JOIN information_schema.tables t USING (table_schema, table_name)
     WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' ORDER BY c.table_name, c.ordinal_position`,
  );
  const live = new Map<string, string[]>();
  for (const r of cols.rows) live.set(r.table_name, [...(live.get(r.table_name) ?? []), r.column_name]);
  const policies = new Set((await db.query("SELECT table_name FROM retention_policies")).rows.map((r) => r.table_name));
  const problems: string[] = [];
  const byName = new Map(inventory.map((t) => [t.table, t]));
  for (const [table, columns] of live) {
    const entry = byName.get(table);
    if (entry) {
      for (const c of columns) if (!entry.columns[c]) problems.push(`column ${table}.${c} is in the database but not in the inventory`);
      for (const c of Object.keys(entry.columns)) if (!columns.includes(c)) problems.push(`the inventory lists ${table}.${c}, which the database does not have`);
      if (!policies.has(table)) problems.push(`table ${table} holds personal data but has no retention policy`);
    } else if (table in notPersonal) {
      for (const c of columns) if (LOOKS_PERSONAL.test(c)) problems.push(`column ${table}.${c} looks personal, but ${table} is declared not personal (${notPersonal[table]})`);
    } else problems.push(`table ${table} is in the database but not in the inventory`);
  }
  for (const t of byName.keys()) if (!live.has(t)) problems.push(`the inventory lists table ${t}, which the database does not have`);
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import("./db.js");
  const problems = await checkInventory(db);
  for (const p of problems) console.log(`inventory: ${p}`);
  console.log(problems.length ? `inventory check FAILED: ${problems.length} problem(s)` : "inventory check passed");
  await db.end();
  process.exitCode = problems.length ? 1 : 0;
}
