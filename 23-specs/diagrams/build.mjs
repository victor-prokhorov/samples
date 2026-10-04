// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "23. Executable specifications with a traceability matrix")
  .box("feature", 40, 140, 260, 120, "change-bank-details\n.feature\n5 Rules, @REQ-01..05\n13 scenarios at the\nboundaries", { bold: true })
  .box("steps", 360, 140, 240, 120, "Cucumber +\nsteps.ts\nfixed today,\nTRUNCATE per\nscenario")
  .box("naive", 680, 100, 300, 80, "IMPL=naive, from the ticket\n6 of 13 scenarios fail", { dashed: true })
  .box("domain", 680, 220, 300, 80, "IMPL=domain, from the rules\n13 of 13 pass")
  .box("ndjson", 360, 340, 240, 80, "--format message\nreports/*.ndjson")
  .box("trace", 680, 340, 300, 80, "trace.ts: requirement ->\nscenarios -> worst step", { bold: true })
  .box("pg", 1060, 340, 200, 80, "spec_results\nin Postgres")
  .arrow("feature", "steps")
  .arrow("steps", "naive")
  .arrow("steps", "domain")
  .arrow("steps", "ndjson")
  .arrow("ndjson", "trace")
  .arrow("trace", "pg")
  .text(40, 450, "Same feature file, two implementations: the naive one fails REQ-02 (one approval applied above 1,000.00),\nREQ-03 (self-approval) and REQ-04 (today counted as the past). A requirement with no scenario shows NOT COVERED.")
  .write(dirname(fileURLToPath(import.meta.url)));
