import { Report } from "./importer.js";

export function show(r: Report) {
  const head = r.status === "dry_run" ? "DRY RUN (rolled back)" : r.status.toUpperCase().replace("_", " ");
  console.log(`   ${r.file} [sha256 ${r.sha256.slice(0, 12)}] -> ${head}${r.batchId ? ` batch ${r.batchId}` : ""}${r.reason ? `: ${r.reason}` : ""}`);
  if (r.rowsReceived !== undefined) console.log(`     rows: declared ${r.rowsDeclared}, received ${r.rowsReceived}, rejected ${new Set(r.rejects.map((x) => x.line_no)).size}`);
  for (const x of r.rejects) console.log(`     reject line ${x.line_no} [${x.rule}] ${x.detail}`);
  if (r.diff) {
    console.log(`     diff: new ${r.diff.added.length} ${JSON.stringify(r.diff.added)}, changed ${r.diff.changed.length}, unchanged ${r.diff.unchanged}, missing ${r.diff.missing.length} ${JSON.stringify(r.diff.missing)}`);
    for (const c of r.diff.changed) console.log(`       changed ${c}`);
  }
  if (r.amounts) {
    const parsed = (Number(r.amounts.accepted) + Number(r.amounts.rejected)).toFixed(2);
    const unparsable = r.amounts.unparsable ? `; ${r.amounts.unparsable} amount(s) not a number, counted on neither side` : "";
    console.log(`     control total: declared ${r.amounts.declared}, amounts that parse ${parsed} (accepted ${r.amounts.accepted} + rejected ${r.amounts.rejected})${unparsable}`);
  }
  if (r.written) console.log(`     upsert: inserted ${r.written.inserted}, updated ${r.written.updated}`);
}
