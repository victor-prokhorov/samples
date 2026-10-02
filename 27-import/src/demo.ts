import { copyFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "./db.js";
import { importFile, MAX_REJECT_RATE } from "./importer.js";
import { naiveImport } from "./naive.js";
import { show } from "./show.js";

const data = (f: string) => join("data", f);

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

async function one<T = Record<string, string>>(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows[0] as T;
}

const naiveTotals = () => one<{ rows: string; total: string }>("SELECT count(*) AS rows, coalesce(sum(amount), 0) AS total FROM naive_contributions");

step("1. Naive import, run twice", "row-by-row INSERT with no natural key: a rerun (a retry after a timeout, an operator running the job again) appends the same rows again");
for (const run of [1, 2]) {
  const r = await naiveImport(data("acme-2026-08-contributions.csv"));
  const t = await naiveTotals();
  console.log(`   run ${run}: inserted ${r.inserted} -> naive_contributions has ${t.rows} rows, total ${t.total}`);
}
let t = await naiveTotals();
check(t.rows === "12" && t.total === "3001.50", "the naive rerun doubled the rows and the total (6 rows, 1500.75 in the file)");
await db.query("TRUNCATE naive_contributions");

step("2. Naive import, a bad row in the middle", "each INSERT commits on its own, so the run stops at the bad row with the rows before it applied; resending the corrected file duplicates those");
let r = await naiveImport(data("acme-2026-09-contributions.csv"));
console.log(`   acme-2026-09-contributions.csv: inserted ${r.inserted}, then ${r.error}`);
t = await naiveTotals();
console.log(`   naive_contributions: ${t.rows} rows (half-applied), total ${t.total}`);
check(r.inserted === 2 && t.rows === "2", "the naive import half-applied the file");
r = await naiveImport(data("acme-2026-09-contributions-v2.csv"));
const dupes = await db.query("SELECT member_no, count(*)::int AS n FROM naive_contributions GROUP BY member_no HAVING count(*) > 1 ORDER BY 1");
t = await naiveTotals();
console.log(`   corrected file resent: inserted ${r.inserted} -> ${t.rows} rows, total ${t.total} (the file says 1175.50); duplicated: ${dupes.rows.map((d) => `${d.member_no} x${d.n}`).join(", ")}`);
check(dupes.rowCount === 2, "the resend duplicated the rows the failed run had committed");

step(
  "3. First load: COPY into staging, validate, upsert on the natural key, one transaction",
  "COPY streams the file into a TEMP staging table of text columns (HEADER match checks the column names); rules run in SQL and write rejects; valid rows are upserted on (employer, member_no[, period]); the batch row and the data commit together",
);
for (const f of ["acme-2026-08-members.csv", "acme-2026-08-contributions.csv"]) {
  const rep = await importFile(data(f));
  show(rep);
  check(rep.status === "applied" && rep.written?.inserted === 6 && rep.rejects.length === 0, `${f} applied 6 new rows`);
}

step("4. Dry run of the September members file", "the same code path in a transaction that is rolled back: it prints the rejects and the diff (new / changed / unchanged / missing) and writes nothing");
const before = await one("SELECT count(*) AS n, max(email) FILTER (WHERE member_no = 'M0001') AS email FROM members");
const dry = await importFile(data("acme-2026-09-members.csv"), { dryRun: true });
show(dry);
const after = await one("SELECT count(*) AS n, max(email) FILTER (WHERE member_no = 'M0001') AS email FROM members");
console.log(`   members after the dry run: ${after.n} rows, M0001 email still ${after.email}; batches applied: ${(await one("SELECT count(*) AS n FROM import_batches")).n}`);
check(JSON.stringify(before) === JSON.stringify(after), "the dry run wrote nothing");
check(dry.diff?.added.join() === "M0007" && dry.diff.changed.length === 1 && dry.diff.unchanged === 3 && dry.diff.missing.join() === "M0004", "diff: 1 new, 1 changed, 3 unchanged, 1 missing");
check(dry.rejects.length === 1 && dry.rejects[0].rule === "birth_date", "the impossible date 1987-02-30 is rejected");

step("5. Apply September: members, then contributions", "valid rows go in, each rejected line gets one row per broken rule with a reason the employer can act on; a missing member is reported, not deleted");
const mem = await importFile(data("acme-2026-09-members.csv"));
show(mem);
check(mem.written?.inserted === 1 && mem.written.updated === 1, "the upsert matches the dry run: 1 inserted, 1 updated, unchanged rows untouched");
const sep = await importFile(data("acme-2026-09-contributions.csv"));
show(sep);
check(sep.status === "applied" && sep.written?.inserted === 5, "5 valid contributions applied");
check(new Set(sep.rejects.map((x) => x.line_no)).size === 3 && sep.rejects.filter((x) => x.line_no === 8).length === 3, "3 lines rejected, line 8 for 3 reasons");

step("6. The same file again, and the same bytes under another name", "the batch records the file's sha256 and a partial unique index allows one applied batch per hash, so a rerun is a no-op whatever the file is called");
const again = await importFile(data("acme-2026-09-contributions.csv"));
show(again);
const dir = await mkdtemp(join(tmpdir(), "import-"));
await copyFile(data("acme-2026-09-contributions.csv"), join(dir, "acme-2026-09-contributions-resent.csv"));
await copyFile(data("acme-2026-09-contributions.ctl"), join(dir, "acme-2026-09-contributions-resent.ctl"));
const renamed = await importFile(join(dir, "acme-2026-09-contributions-resent.csv"));
show(renamed);
check(again.status === "already_applied" && renamed.status === "already_applied", "both reruns were no-ops");

step("7. The employer sends the corrected full month", "the upsert is idempotent: lines that did not change are counted unchanged and not rewritten, the corrected line is inserted, nothing is duplicated");
const v2 = await importFile(data("acme-2026-09-contributions-v2.csv"));
show(v2);
check(v2.written?.inserted === 1 && v2.written.updated === 0 && v2.diff?.unchanged === 5, "1 inserted (M0003), 5 unchanged");

step("8. Files refused as a whole", `a file is applied whole-or-not when its shape is wrong: wrong columns (COPY HEADER match), fewer rows than the control file declares, or more than ${MAX_REJECT_RATE * 100}% of rows rejected`);
for (const f of ["initech-2026-09-contributions.csv", "initech-2026-09-members.csv", "globex-2026-09-contributions.csv"]) {
  const rep = await importFile(data(f));
  show(rep);
  check(rep.status === "refused", `${f} refused`);
}
const leaked = await one("SELECT count(*) AS n FROM members WHERE employer <> 'acme'");
check(leaked.n === "0", "nothing from the refused files reached members or contributions");

step("9. Reconciliation", "after the load, the target must agree with the batch log: per employer and month, the rows and the sum in contributions equal what the last applied batch accepted");
const rec = await db.query(`
  SELECT b.employer, b.period, b.id AS batch, b.accepted, b.amount_accepted, count(c.*)::int AS in_table, coalesce(sum(c.amount), 0)::text AS sum_in_table
  FROM import_batches b LEFT JOIN contributions c ON c.employer = b.employer AND c.period = b.period
  WHERE b.kind = 'contributions' AND b.status = 'applied'
    AND b.id = (SELECT max(id) FROM import_batches x WHERE x.kind = b.kind AND x.employer = b.employer AND x.period = b.period AND x.status = 'applied')
  GROUP BY b.id ORDER BY b.period`);
for (const x of rec.rows) {
  const ok = x.accepted === x.in_table && x.amount_accepted === x.sum_in_table;
  console.log(`   ${x.employer} ${x.period}: batch ${x.batch} accepted ${x.accepted} rows / ${x.amount_accepted}; contributions has ${x.in_table} rows / ${x.sum_in_table} -> ${ok ? "reconciled" : "MISMATCH"}`);
  check(ok, `${x.employer} ${x.period} reconciles`);
}
const bal = await db.query("SELECT id, rows_received, accepted, rejected FROM import_batches WHERE status = 'applied' AND rows_received <> accepted + rejected");
check(bal.rowCount === 0, "every applied batch: rows received = accepted + rejected");
console.log("   every applied batch: rows received = accepted + rejected");

await db.end();
