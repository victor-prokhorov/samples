// node diagrams/build.mjs  ->  overview.excalidraw and overview.svg in this folder.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "36. Observability: one trace id joins logs, spans, metrics")
  .box("load", 40, 120, 130, 70, "traffic\n130 requests")
  .box("web", 250, 120, 180, 70, "web BFF :53046\npino + OTel SDK")
  .box("api", 580, 120, 180, 70, "API :53146\npino + OTel SDK")
  .box("pg", 910, 120, 180, 70, "Postgres :55466\nstatement log")
  .box("col", 405, 290, 200, 80, "collector\nOTLP/HTTP JSON in,\nspans stored as JSON", { bold: true })
  .box("wf", 250, 460, 180, 70, "waterfall\nout/trace-*.html")
  .box("red", 580, 460, 180, 70, "RED per route\nvs 29's SLO")
  .box("before", 910, 290, 180, 80, "before: N+1\n602 queries\none per member", { dashed: true })
  .box("after", 910, 460, 180, 70, "after: one join\n2 queries", { bold: true })
  .arrow("load", "web")
  .arrow("web", "api", { label: "traceparent" })
  .arrow("api", "pg", { label: "/*traceparent*/" })
  .arrow("web", "col", { fromSide: "bottom", toSide: "left", via: [[340, 330]] })
  .arrow("api", "col", { fromSide: "bottom", toSide: "right", via: [[670, 330]] })
  .arrow("col", "wf", { fromSide: "bottom", toSide: "top", via: [[455, 420], [340, 420]] })
  .arrow("col", "red", { fromSide: "bottom", toSide: "top", via: [[555, 420], [670, 420]] })
  .arrow("before", "after", { label: "fix" })
  .text(40, 570, "A slow-request log line gives the trace id; the collector returns that trace; the waterfall shows the N+1.\nThe same id is in the API log and in every Postgres statement it sent.")
  .write(dirname(fileURLToPath(import.meta.url)));
