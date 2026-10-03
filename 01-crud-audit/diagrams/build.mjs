// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "01. CRUD with an audit log in the same transaction")
  .frame("before", 40, 90, 360, 330, "Before: plain CRUD")
  .box("app0", 60, 140, 320, 60, "App: UPDATE price 49 -> 39")
  .box("prod0", 60, 230, 320, 60, "products\ncurrent state only")
  .box("lost", 60, 350, 320, 60, "old value, who, when: gone", { dashed: true })
  .arrow("app0", "prod0")
  .arrow("prod0", "lost", { dashed: true, label: "overwritten" })
  .frame("after", 440, 90, 540, 330, "After: one transaction, tx()")
  .box("app", 460, 140, 500, 60, "App: update(id, patch, actor)", { bold: true })
  .box("prod", 460, 240, 240, 80, "products\nSELECT ... FOR UPDATE\n(before), then UPDATE")
  .box("audit", 720, 240, 240, 80, "audit_log, append-only\nactor, action,\nbefore, after (JSONB)")
  .box("hist", 720, 340, 240, 60, "history(id): who changed\nwhat, from what, when")
  .arrow("app", "prod")
  .arrow("app", "audit")
  .arrow("audit", "hist")
  .text(40, 440, "The data change and its audit row commit or roll back together: an audit insert that fails\n(empty actor) rolls the price change back, and the history survives a DELETE.")
  .write(dirname(fileURLToPath(import.meta.url)));
