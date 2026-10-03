// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
// Only overview.* is written here; the other SVGs in this folder are the Mermaid renders of src/render.ts (npm run render).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "32. A design case whose documents are checked against each other")
  .box("draft", 40, 130, 300, 110, "fixtures/draft/\nthe same documents with\nthe defects a review misses", { dashed: true })
  .box("docs", 40, 360, 300, 110, "casebook/*.md\n11 documents, with Mermaid\nand SQL blocks inside", { bold: true })
  .frame("checks", 420, 90, 440, 420, "The same checks on both")
  .box("trace", 440, 140, 400, 100, "Traceability: every requirement has\nGiven/When/Then criteria and a journey\nstep; ER = DDL; states = status CHECK")
  .box("render", 440, 260, 400, 100, "mermaid-cli in Chromium: every\ndiagram renders (a parse error fails)\n-> diagrams/*.svg, committed")
  .box("schema", 440, 380, 400, 110, "DDL + seed on Postgres; each journey\nquery runs as portal_app under RLS\nand returns its expected rows")
  .box("bad", 940, 130, 300, 110, "draft: a requirement with no\ncriteria, an unmapped step,\nER != DDL, a parse error, ...", { dashed: true })
  .box("good", 940, 360, 300, 110, "real: every check passes;\n9 diagrams rendered; J4.3\nrefused by four_eyes")
  .arrow("draft", "checks")
  .arrow("docs", "checks")
  .arrow("checks", "bad")
  .arrow("checks", "good")
  .text(40, 540, "Each document was reviewed on its own; the checks compare them with each other. They prove the documents\nagree, not that they are right: only research and real use do that.")
  .write(dirname(fileURLToPath(import.meta.url)));
