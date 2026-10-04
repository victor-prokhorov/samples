// The purge job: for each policy row, delete or anonymise expired rows in batches, skipping anyone under a legal hold.
// Each batch is its own short transaction (FOR UPDATE SKIP LOCKED), so the job never holds long locks and can stop
// and resume anywhere. Running it twice is harmless: the second run finds nothing.
import type pg from "pg";

type PolicyRow = { seq: number; table_name: string; keep: string; anchor_sql: string; anchor_label: string; subject_sql: string; action: string; anonymise_sql: string | null; pending_sql: string | null };

const held = (p: PolicyRow) => `EXISTS (SELECT 1 FROM legal_holds h WHERE h.member_id = ${p.subject_sql} AND h.released_at IS NULL)`;
const expired = (p: PolicyRow) => `(${p.anchor_sql}) + '${p.keep}'::interval <= $1::timestamptz ${p.pending_sql ? `AND ${p.pending_sql}` : ""}`;

export async function loadPolicies(db: pg.Pool): Promise<PolicyRow[]> {
  return (await db.query("SELECT seq, table_name, keep::text AS keep, anchor_sql, anchor_label, subject_sql, action, anonymise_sql, pending_sql FROM retention_policies ORDER BY seq")).rows;
}

export async function eligibility(db: pg.Pool, now: Date) {
  const out = [];
  for (const p of await loadPolicies(db)) {
    const r = await db.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE ${expired(p)} AND NOT ${held(p)})::int AS eligible, count(*) FILTER (WHERE ${expired(p)} AND ${held(p)})::int AS held FROM ${p.table_name} t`,
      [now],
    );
    out.push({ table: p.table_name, keep: p.keep, anchor: p.anchor_label, action: p.action, ...r.rows[0] });
  }
  return out as { table: string; keep: string; anchor: string; action: string; total: number; eligible: number; held: number }[];
}

export async function purge(db: pg.Pool, now: Date, batchSize = 1000, log = console.log) {
  const results = [];
  for (const p of await loadPolicies(db)) {
    const heldRows = (await db.query(`SELECT count(*)::int AS n FROM ${p.table_name} t WHERE ${expired(p)} AND ${held(p)}`, [now])).rows[0].n;
    let purged = 0;
    let batches = 0;
    for (;;) {
      const batch = `SELECT t.ctid FROM ${p.table_name} t WHERE ${expired(p)} AND NOT ${held(p)} LIMIT ${batchSize} FOR UPDATE OF t SKIP LOCKED`;
      const sql = p.action === "delete" ? `DELETE FROM ${p.table_name} WHERE ctid IN (${batch})` : `UPDATE ${p.table_name} AS t SET ${p.anonymise_sql} WHERE t.ctid IN (${batch})`;
      const r = await db.query(sql, [now]);
      if (!r.rowCount) break;
      purged += r.rowCount;
      batches++;
    }
    await db.query("INSERT INTO purge_runs (at, table_name, action, purged, held, batches) VALUES ($1, $2, $3, $4, $5, $6)", [now, p.table_name, p.action, purged, heldRows, batches]);
    if (purged || heldRows) log(`   ${p.action === "delete" ? "deleted   " : "anonymised"} ${String(purged).padStart(6)} from ${p.table_name.padEnd(16)} in ${batches} batch(es)${heldRows ? `, ${heldRows} kept under a legal hold` : ""}`);
    results.push({ table: p.table_name, action: p.action, purged, held: heldRows, batches });
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db, clock } = await import("./db.js");
  const r = await purge(db, clock.now());
  console.log(`purge: ${r.reduce((n, x) => n + x.purged, 0)} rows`);
  await db.end();
}
