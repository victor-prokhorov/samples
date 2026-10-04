// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "24. Characterization tests: record legacy, then rewrite against it")
  .box("inputs", 40, 110, 260, 110, "Inputs\nboundaries on every\nthreshold + 1000 seeded\ncases (mulberry32)")
  .box("legacy", 360, 110, 260, 110, "legacy PL/pgSQL\nas found, quirks\nand bugs included", { dashed: true })
  .box("golden", 680, 110, 300, 110, "Golden master, committed\napproved/legacy.approved.tsv\n1352 cases", { bold: true })
  .box("rewrite", 360, 290, 260, 110, "TypeScript rewrite\nthe booklet + one flag\nper learned rule")
  .box("compare", 680, 290, 300, 110, "Compare\nbooklet: 676 differ\nfinal: 1310 equal, 42\nallowlisted, 0 unexplained")
  .box("rules", 680, 470, 300, 110, "Mismatch -> smallest set\nof rules: truncateToCent 417,\ncapSalaryBeforeOffset 114, ...")
  .box("decide", 360, 470, 260, 110, "decisions.ts: keep the\nquirk or fix it on purpose\n-> decision-table.md")
  .arrow("inputs", "legacy")
  .arrow("legacy", "golden")
  .arrow("golden", "compare")
  .arrow("rewrite", "compare")
  .arrow("compare", "rules")
  .arrow("rules", "decide")
  .arrow("decide", "rewrite", { label: "flags" })
  .text(40, 610, "Legacy is the reference, bugs included, until someone decides otherwise. Four quirks kept, the leap-year age fixed\non purpose (the allowlist). A later rounding change shows up as 430 unexplained mismatches: the bar turns red.")
  .write(dirname(fileURLToPath(import.meta.url)));
