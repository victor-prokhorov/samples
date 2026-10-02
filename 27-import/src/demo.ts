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
check(sep.amounts?.declared === "1075.50" && sep.amounts.unparsable === 1, "the control total matches the amounts that parse; 18O.00 is in neither");

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

step(
  "8. Files refused as a whole",
  `a file is applied whole-or-not when its shape is wrong: wrong columns (COPY HEADER match), fewer rows than the control file declares, more than ${MAX_REJECT_RATE * 100}% of rows rejected, or a control total the amounts that parse do not add up to; the refused batch keeps its rejects`,
);
const refused: Record<string, number> = {};
for (const f of ["initech-2026-09-contributions.csv", "initech-2026-09-members.csv", "globex-2026-09-contributions.csv", "acme-2026-10-contributions.csv"]) {
  const rep = await importFile(data(f));
  show(rep);
  check(rep.status === "refused", `${f} refused`);
  refused[f] = rep.batchId!;
}
const leaked = await one("SELECT (SELECT count(*) FROM members WHERE employer <> 'acme') + (SELECT count(*) FROM contributions WHERE period = '2026-10') AS n");
check(leaked.n === "0", "nothing from the refused files reached members or contributions");
const kept = await db.query("SELECT batch_id, count(*)::int AS n FROM import_rejects WHERE batch_id = ANY ($1) GROUP BY batch_id ORDER BY batch_id", [Object.values(refused)]);
console.log(`   rejects stored for the refused batches: ${kept.rows.map((x) => `batch ${x.batch_id}: ${x.n}`).join(", ")}`);
check(
  kept.rows.find((x) => x.batch_id === refused["globex-2026-09-contributions.csv"])?.n === 3 && kept.rows.find((x) => x.batch_id === refused["acme-2026-10-contributions.csv"])?.n === 1,
  "the refused batches kept their rejects (3 for globex, 1 for acme October)",
);

step(
  "9. Reconciliation",
  "only batches write contributions, by insert or update, never delete; so per employer and month the rows equal what every applied batch inserted, and the sum equals the sum of each batch's net change (new minus old amount over the rows it wrote), whether a file was the full month or a few corrected lines",
);
const rec = await db.query(`
  SELECT b.employer, b.period, string_agg(b.id::text, ' + ' ORDER BY b.id) AS batches,
    string_agg(b.inserted::text, ' + ' ORDER BY b.id) AS each_inserted, sum(b.inserted)::int AS inserted,
    string_agg(b.amount_net::text, ' + ' ORDER BY b.id) AS each_net, sum(b.amount_net)::text AS net,
    (SELECT count(*)::int FROM contributions c WHERE c.employer = b.employer AND c.period = b.period) AS in_table,
    (SELECT coalesce(sum(c.amount), 0)::text FROM contributions c WHERE c.employer = b.employer AND c.period = b.period) AS sum_in_table
  FROM import_batches b WHERE b.kind = 'contributions' AND b.status = 'applied'
  GROUP BY b.employer, b.period ORDER BY b.period`);
for (const x of rec.rows) {
  const ok = x.inserted === x.in_table && x.net === x.sum_in_table;
  console.log(
    `   ${x.employer} ${x.period}: batch ${x.batches} inserted ${x.each_inserted} = ${x.inserted} rows, net ${x.each_net} = ${x.net}; contributions has ${x.in_table} rows / ${x.sum_in_table} -> ${ok ? "reconciled" : "MISMATCH"}`,
  );
  check(ok, `${x.employer} ${x.period} reconciles`);
}
const stray = await db.query(`
  SELECT c.* FROM contributions c JOIN import_batches b ON b.id = c.last_batch_id
  WHERE b.status <> 'applied' OR b.kind <> 'contributions' OR b.employer <> c.employer OR b.period <> c.period`);
check(stray.rowCount === 0, "every contribution points at the applied batch of its employer and month that last wrote it");
console.log("   every contribution: last_batch_id is an applied contributions batch of the same employer and month");
const bal = await db.query("SELECT id, rows_received, accepted, rejected FROM import_batches WHERE status = 'applied' AND rows_received <> accepted + rejected");
check(bal.rowCount === 0, "every applied batch: rows received = accepted + rejected");
console.log("   every applied batch: rows received = accepted + rejected");

await db.end();
