// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "29. Product and service KPIs, defined once")
  .box("sim", 40, 130, 220, 110, "Simulator\n28 days, 120 members,\na 4-hour database\nincident")
  .box("server", 320, 130, 260, 110, "Portal :53039\n(separate process)\ntrack() + a row\nper request")
  .box("events", 640, 90, 260, 80, "events: login,\nchange_started, ...")
  .box("reqlog", 640, 200, 260, 80, "request_log: route,\nstatus, duration")
  .box("kpis", 960, 110, 260, 150, "kpis.ts\none definition each:\nquestion, formula,\nunit, target,\nowner, SQL", { bold: true })
  .box("dash", 960, 320, 260, 90, "out/dashboard.html\nstatic, no script")
  .arrow("sim", "server")
  .arrow("server", "events")
  .arrow("server", "reqlog")
  .arrow("events", "kpis")
  .arrow("reqlog", "kpis")
  .arrow("kpis", "dash")
  .box("vanity", 40, 460, 540, 90, "Before: 712 logins this month, mean latency 51 ms,\n/health answering 200 all through the outage", { dashed: true })
  .box("better", 640, 460, 580, 90, "After: adoption by employer (Initech 22%), p95 of the\nslowest member route (356 ms), availability against\nthe 99.5% SLO: the error budget gone in one morning")
  .arrow("vanity", "better")
  .text(40, 580, "Product KPIs read the usage events, service KPIs the request log. The report, the dashboard and the checks\nread the same definitions, so \"adoption\" cannot mean two things.")
  .write(dirname(fileURLToPath(import.meta.url)));
