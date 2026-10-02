import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { pipeline } from "node:stream/promises";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { db } from "./db.js";
import { KINDS, Kind } from "./kinds.js";

export const MAX_REJECT_RATE = 0.5;

export type Reject = { line_no: number; rule: string; detail: string };

export type Report = {
  file: string;
  sha256: string;
  kind: string;
  employer: string;
  period: string;
  status: "applied" | "dry_run" | "already_applied" | "refused";
  batchId?: number;
  reason?: string;
  rowsDeclared?: number;
  rowsReceived?: number;
  rejects: Reject[];
  diff?: { added: string[]; changed: string[]; unchanged: number; missing: string[] };
  written?: { inserted: number; updated: number };
  amounts?: { declared: string; accepted: string; rejected: string; unparsable: number };
};

class Refused extends Error {}

const ctl = (text: string) => Object.fromEntries(text.trim().split("\n").map((l) => l.split("=") as [string, string]));

export async function importFile(path: string, opts: { dryRun?: boolean } = {}): Promise<Report> {
  const bytes = await readFile(path);
  const file = basename(path);
  const parsed = /^([a-z]+)-(\d{4}-\d{2})-(members|contributions)(-[\w-]+)?\.csv$/.exec(file);
  if (!parsed) throw new Error(`${file}: expected <employer>-<YYYY-MM>-<members|contributions>[-suffix].csv`);
  const [, employer, period, kindName] = parsed;
  const kind = KINDS[kindName];
  const control = ctl(await readFile(path.replace(/\.csv$/, ".ctl"), "utf8"));
  const report: Report = {
    file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    kind: kindName,
    employer,
    period,
    status: "refused",
    rowsDeclared: Number(control.rows),
    rejects: [],
  };
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // One import per employer and kind at a time; the unique index on sha256 catches the same file twice.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${employer}/${kindName}`]);
    const batch = await client.query<{ id: number }>(
      `INSERT INTO import_batches (file_name, sha256, kind, employer, period, status, rows_declared, amount_declared)
       VALUES ($1, $2, $3, $4, $5, 'applied', $6, $7)
       ON CONFLICT (sha256) WHERE status = 'applied' DO NOTHING RETURNING id`,
      [file, report.sha256, kindName, employer, period, report.rowsDeclared, control.amount ?? null],
    );
    if (!batch.rowCount) {
      await client.query("ROLLBACK");
      const prev = await client.query("SELECT id, file_name FROM import_batches WHERE sha256 = $1 AND status = 'applied'", [report.sha256]);
      return { ...report, status: "already_applied", batchId: prev.rows[0].id, reason: `same bytes as batch ${prev.rows[0].id} (${prev.rows[0].file_name})` };
    }
    report.batchId = batch.rows[0].id;
    await run(client, kind, path, report, control.amount);
    if (opts.dryRun) {
      await client.query("ROLLBACK");
      return { ...report, status: "dry_run", batchId: undefined };
    }
    await client.query("COMMIT");
    return { ...report, status: "applied" };
  } catch (err) {
    await client.query("ROLLBACK");
    if (!(err instanceof Refused)) throw err;
    report.reason = err.message;
    if (!opts.dryRun) {
      const r = await client.query<{ id: number }>(
        `INSERT INTO import_batches (file_name, sha256, kind, employer, period, status, reason, rows_declared, rows_received, rejected, amount_declared)
         VALUES ($1, $2, $3, $4, $5, 'refused', $6, $7, $8, $9, $10) RETURNING id`,
        [file, report.sha256, kindName, employer, period, report.reason, report.rowsDeclared, report.rowsReceived ?? null, new Set(report.rejects.map((r) => r.line_no)).size, control.amount ?? null],
      );
      report.batchId = r.rows[0].id;
    }
    return report;
  } finally {
    client.release();
  }
}

async function run(c: pg.PoolClient, kind: Kind, path: string, report: Report, amountDeclared: string | undefined) {
  const sql = (s: string) => s.replaceAll(":employer", c.escapeLiteral(report.employer)).replaceAll(":period", c.escapeLiteral(report.period));
  const batchId = report.batchId!;

  await c.query(`CREATE TEMP TABLE stage (line_no INT GENERATED ALWAYS AS IDENTITY (START WITH 2), ${kind.columns.map((col) => `${col} TEXT`).join(", ")}) ON COMMIT DROP`);
  try {
    await pipeline(createReadStream(path), c.query(copyFrom(`COPY stage (${kind.columns.join(", ")}) FROM STDIN WITH (FORMAT csv, HEADER match)`)));
  } catch (err) {
    throw new Refused(`COPY refused the file: ${(err as Error).message}`);
  }
  report.rowsReceived = Number((await c.query("SELECT count(*) FROM stage")).rows[0].count);
  if (report.rowsReceived !== report.rowsDeclared) {
    throw new Refused(`control count: the .ctl declares ${report.rowsDeclared} rows, the file has ${report.rowsReceived} (truncated or padded file)`);
  }

  for (const r of kind.rules) {
    await c.query(
      sql(`INSERT INTO import_rejects (batch_id, line_no, rule, detail, raw)
           SELECT ${batchId}, s.line_no, '${r.rule}', ${r.detail}, to_jsonb(s) - 'line_no' FROM stage s WHERE ${r.when}`),
    );
  }
  report.rejects = (await c.query<Reject>("SELECT line_no, rule, detail FROM import_rejects WHERE batch_id = $1 ORDER BY line_no, rule", [batchId])).rows;
  const rejected = new Set(report.rejects.map((r) => r.line_no)).size;
  if (rejected / report.rowsReceived > MAX_REJECT_RATE) {
    throw new Refused(`${rejected} of ${report.rowsReceived} rows rejected, over the ${MAX_REJECT_RATE * 100}% threshold: nothing applied`);
  }

  const cols = kind.columns.map((col) => `${kind.typed[col] ?? `s.${col}`} AS ${col}`).join(", ");
  await c.query(
    `CREATE TEMP TABLE valid ON COMMIT DROP AS SELECT s.line_no, ${cols} FROM stage s
     WHERE NOT EXISTS (SELECT 1 FROM import_rejects r WHERE r.batch_id = ${batchId} AND r.line_no = s.line_no)`,
  );

  const t = kind.table;
  const on = (a: string, b: string) => kind.key.map((k) => `${a}.${k} = ${b}.${k}`).join(" AND ");
  const label = (a: string) => kind.key.slice(1).map((k) => `${a}.${k}`).join(" || '/' || ");
  const differs = (a: string, b: string) => `ROW(${kind.values.map((v) => `${a}.${v}`)}) IS DISTINCT FROM ROW(${kind.values.map((v) => `${b}.${v}`)})`;
  const added = await c.query(`SELECT ${label("v")} AS k FROM valid v WHERE NOT EXISTS (SELECT 1 FROM ${t} t WHERE ${on("t", "v")}) ORDER BY 1`);
  const changed = await c.query(
    `SELECT ${label("v")} AS k, ${kind.values.map((v) => `t.${v}::text AS old_${v}, v.${v}::text AS new_${v}`).join(", ")}
     FROM valid v JOIN ${t} t ON ${on("t", "v")} WHERE ${differs("t", "v")} ORDER BY 1`,
  );
  const unchanged = await c.query(`SELECT count(*)::int AS n FROM valid v JOIN ${t} t ON ${on("t", "v")} WHERE NOT ${differs("t", "v")}`);
  const missing = await c.query(
    sql(`SELECT ${label("t")} AS k FROM ${t} t WHERE ${kind.scope.map((s) => `t.${s} = :${s}`).join(" AND ")}
         AND NOT EXISTS (SELECT 1 FROM stage s WHERE ${on("s", "t")}) ORDER BY 1`),
  );
  report.diff = {
    added: added.rows.map((r) => r.k),
    changed: changed.rows.map((r) => `${r.k} ${kind.values.filter((v) => r[`old_${v}`] !== r[`new_${v}`]).map((v) => `${v}: ${r[`old_${v}`]} -> ${r[`new_${v}`]}`).join(", ")}`),
    unchanged: unchanged.rows[0].n,
    missing: missing.rows.map((r) => r.k),
  };

  if (kind.amount) {
    const a = kind.amount;
    const sums = await c.query(
      `SELECT (SELECT coalesce(sum(${a}), 0) FROM valid)::text AS accepted,
              (SELECT coalesce(sum(s.${a}::numeric), 0) FROM stage s WHERE NOT EXISTS (SELECT 1 FROM valid v WHERE v.line_no = s.line_no)
                 AND pg_input_is_valid(coalesce(s.${a}, ''), 'numeric(12, 2)'))::text AS rejected,
              (SELECT count(*)::int FROM stage s WHERE NOT pg_input_is_valid(coalesce(s.${a}, ''), 'numeric(12, 2)')) AS unparsable`,
    );
    report.amounts = { declared: amountDeclared ?? "?", ...sums.rows[0] };
    const gap = Number(amountDeclared) - Number(sums.rows[0].accepted) - Number(sums.rows[0].rejected);
    if (Math.abs(gap) > 0.001 && sums.rows[0].unparsable === 0) {
      throw new Refused(`control total: the .ctl declares ${amountDeclared}, the file adds up to ${(Number(amountDeclared) - gap).toFixed(2)}`);
    }
  }

  const all = [...kind.columns, "last_batch_id"];
  const written = await c.query<{ inserted: boolean }>(
    `INSERT INTO ${t} (${all.join(", ")}) SELECT ${kind.columns.join(", ")}, ${batchId} FROM valid
     ON CONFLICT (${kind.key.join(", ")}) DO UPDATE SET ${[...kind.values, "last_batch_id"].map((v) => `${v} = EXCLUDED.${v}`).join(", ")}
     WHERE ${differs(t, "EXCLUDED")}
     RETURNING (xmax = 0) AS inserted`,
  );
  report.written = { inserted: written.rows.filter((r) => r.inserted).length, updated: written.rows.filter((r) => !r.inserted).length };
  await c.query(
    `UPDATE import_batches SET rows_received = $2, accepted = $3, rejected = $4, inserted = $5, updated = $6, unchanged = $7, missing = $8,
       amount_accepted = $9, amount_rejected = $10 WHERE id = $1`,
    [
      batchId,
      report.rowsReceived,
      report.rowsReceived - rejected,
      rejected,
      report.written.inserted,
      report.written.updated,
      report.diff.unchanged,
      report.diff.missing.length,
      report.amounts?.accepted ?? null,
      report.amounts?.rejected ?? null,
    ],
  );
}
