// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "27. Monthly CSV import: one transaction per file, rerun-safe")
  .box("naive", 40, 90, 1180, 60, "Before: row-by-row INSERT. A rerun doubles every row (12 rows, 3001.50); a typo on line 4 leaves\nthe file half-applied, and the corrected resend duplicates what was already committed", { dashed: true })
  .box("file", 40, 240, 200, 120, "acme-2026-09-\ncontributions.csv\n+ .ctl: row count,\namount total")
  .frame("tx", 290, 190, 930, 210, "One transaction per file (a dry run rolls it back)")
  .box("stage", 310, 240, 200, 120, "COPY into a\nTEMP staging\ntable")
  .box("rules", 540, 240, 200, 120, "rules in SQL ->\nimport_rejects:\nline, rule, reason")
  .box("diff", 770, 240, 200, 120, "diff: new, changed,\nunchanged, missing;\ncontrol total")
  .box("upsert", 1000, 240, 200, 120, "upsert on the\nnatural key, IS\nDISTINCT FROM;\nbatch + sha256", { bold: true })
  .arrow("file", "stage")
  .arrow("stage", "rules")
  .arrow("rules", "diff")
  .arrow("diff", "upsert")
  .box("same", 40, 440, 560, 60, "the same bytes again, under any name:\nALREADY APPLIED, a no-op (sha256)")
  .box("fixed", 660, 440, 560, 60, "the corrected full month: 1 row inserted,\n5 unchanged, no duplicate")
  .text(40, 530, "Bad lines are rejected with a reason; a wrong header, a short file, over 50% rejects or a control total that\ndoes not add up refuses the whole file. Every row knows its batch, so the load is reconciled with a query.")
  .write(dirname(fileURLToPath(import.meta.url)));
