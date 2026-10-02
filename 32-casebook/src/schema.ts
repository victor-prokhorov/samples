import pg from "pg";
import { pathToFileURL } from "node:url";
import { blocks, docs } from "./extract.js";

export const url = (database = "postgres") => `postgres://postgres:postgres@localhost:55462/${database}`;

export type QueryResult = { step: string; expect: string; ok: boolean; rows: Record<string, unknown>[]; error?: string };

// Applies the data model's DDL and seed, then runs each journey query in document order on one connection.
export async function schema(files: string[], database = "postgres") {
  const all = await blocks(files);
  const client = new pg.Client({ connectionString: url(database) });
  await client.connect();
  const ddl = all.find((b) => b.marker === "sql: ddl")!;
  const seed = all.find((b) => b.marker === "sql: seed")!;
  await client.query(ddl.code);
  await client.query(seed.code);
  const tables = (await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'")).rows[0].n as number;
  const results: QueryResult[] = [];
  for (const q of all.filter((b) => /^sql: J/.test(b.marker))) {
    const [, step, , expect] = q.marker.split(" ");
    try {
      const res = await client.query(q.code);
      const last = Array.isArray(res) ? res[res.length - 1] : res;
      results.push({ step, expect, ok: expect !== "error" && last.rows.length === Number(expect), rows: last.rows });
    } catch (err) {
      results.push({ step, expect, ok: expect === "error", rows: [], error: err instanceof Error ? err.message : String(err) });
    }
  }
  await client.end();
  return { tables, results };
}

export const cell = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v));

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { tables, results } = await schema(await docs());
  console.log(`   ${tables} tables`);
  for (const r of results) console.log(`   ${r.step} expect ${r.expect}: ${r.ok ? "ok" : "MISMATCH"} ${r.error ?? `${r.rows.length} row(s)`}`);
}
