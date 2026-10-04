// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "17. One audit trail across services, through an outbox")
  .box("orders", 40, 110, 320, 100, "orders database\nchange + audit_outbox row\n(actor, reason, before, after)\nin one transaction")
  .box("billing", 40, 270, 320, 100, "billing database\nsame: change + audit_outbox\nrow in one transaction")
  .box("shipper", 460, 190, 240, 100, "Shipper\nclaim SKIP LOCKED,\nsend, then mark shipped", { bold: true })
  .box("central", 800, 190, 300, 100, "Central audit database\naudit_events, PK event_id\n(re-sends skipped); trigger\nrejects UPDATE, DELETE", { bold: true })
  .box("crash", 460, 360, 240, 80, "crash after send:\nre-sent, never lost", { dashed: true })
  .box("psql", 40, 430, 320, 70, "psql UPDATE total = 0:\nbypasses the app, no trace", { dashed: true })
  .arrow("orders", "shipper")
  .arrow("billing", "shipper")
  .arrow("shipper", "central")
  .arrow("shipper", "crash", { dashed: true })
  .arrow("psql", "orders", { dashed: true, via: [[20, 465], [20, 160]] })
  .text(40, 530, "01's same-transaction audit plus 09's outbox: a rolled-back change leaves no event, a committed one cannot\nmiss its event. One timeline with actors and reasons; writes outside the app need pgaudit or triggers too.")
  .write(dirname(fileURLToPath(import.meta.url)));
