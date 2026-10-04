// node diagrams/build.mjs  ->  overview.excalidraw and overview.svg in this folder.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "46. Load test: how much traffic does it hold?")
  .box("k6", 40, 110, 260, 80, "k6, open model\nsmoke, gate, ramp, soak", { bold: true })
  .box("api", 400, 110, 240, 80, "Member API\nnode:http, pool of 4")
  .box("pg", 740, 110, 240, 80, "Postgres\n500,000 members")
  .box("slo", 40, 270, 260, 70, "SLO thresholds\np95 < 300 ms, errors < 1%")
  .box("ci", 40, 410, 260, 70, "CI gate\nk6 exit 99 = fail, 0 = pass", { bold: true })
  .box("little", 400, 270, 240, 80, "Ramp: Little's law\nL = X x W\n4 / 0.040 s = 100 req/s")
  .box("scan", 740, 270, 240, 70, "search: full scan\nWHERE lower(email) = ...", { dashed: true })
  .box("index", 740, 410, 240, 70, "expression index\non lower(email)", { bold: true })
  .arrow("k6", "api", { label: "HTTP" })
  .arrow("api", "pg")
  .arrow("k6", "slo")
  .arrow("slo", "ci")
  .arrow("api", "little", { label: "saturates at" })
  .arrow("pg", "scan", { dashed: true, label: "before" })
  .arrow("scan", "index", { label: "CREATE INDEX" })
  .text(40, 520, "The same gate fails on the slow search (exit 99) and passes after the index (exit 0).\nPast 100 req/s the API serves no more: requests queue for a connection and latency bends up.")
  .write(dirname(fileURLToPath(import.meta.url)));
