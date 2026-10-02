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
    // "sql: J4.3 expect error four_eyes": an expected error names the constraint that must refuse, so any other error is a mismatch
    const [, step, , count, constraint] = q.marker.split(" ");
    const expect = count === "error" ? `error ${constraint ?? "(no constraint named)"}` : count;
    try {
      const res = await client.query(q.code);
      // the rows of the last statement, transaction control aside (a block may end with COMMIT)
      const last = ([res].flat() as pg.QueryResult[]).reverse().find((r) => !["BEGIN", "COMMIT", "SET"].includes(r.command)) ?? { rows: [] };
      results.push({ step, expect, ok: count !== "error" && last.rows.length === Number(count), rows: last.rows });
    } catch (err) {
      // a block that failed inside BEGIN leaves the transaction aborted: end it before the next block
      await client.query("ROLLBACK");
      const name = (err as { constraint?: string }).constraint;
      const message = err instanceof Error ? err.message : String(err);
      results.push({ step, expect, ok: count === "error" && !!constraint && name === constraint, rows: [], error: message });
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
