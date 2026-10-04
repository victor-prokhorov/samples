// node diagrams/build.mjs  ->  overview.excalidraw and overview.svg in this folder.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "43. Personal-data requests driven by a data inventory")
  .box("member", 40, 120, 190, 90, "Member\npassword typed\nless than 5 min ago")
  .box("api", 290, 120, 230, 90, "Portal\nPOST /me/data-export\nsubject = the session's\nmember, never a parameter")
  .box("inventory", 610, 120, 260, 90, "Data inventory\ntable, column, category,\npurpose, lawful basis", { bold: true })
  .box("db", 1030, 120, 220, 90, "Postgres\n12 tables with personal\ndata, 3 without")
  .box("check", 610, 270, 260, 90, "Inventory check\nan unknown table or column\nfails it: export refused")
  .box("export", 290, 270, 230, 90, "Export zip\ndata.json, csv/, README,\nindex.html, manifest")
  .box("log", 40, 270, 190, 90, "Request log\nreceived, due in\none month, timeline")
  .box("policies", 610, 440, 260, 80, "Retention policies\nhow long, from when,\ndelete or anonymise")
  .box("purge", 1030, 440, 220, 80, "Purge job\nbatches of 1000,\nskips legal holds")
  .box("erasure", 40, 440, 190, 80, "Erasure (art. 17):\nsee 18-crypto-shredding", { dashed: true })
  .arrow("member", "api")
  .arrow("api", "inventory", { label: "collect" })
  .arrow("inventory", "db", { label: "SELECT per table" })
  .arrow("check", "inventory", { label: "compares" })
  .arrow("check", "db", { label: "information_schema" })
  .arrow("api", "export")
  .arrow("api", "log", { label: "logged" })
  .arrow("policies", "purge")
  .arrow("purge", "db", { label: "DELETE / UPDATE" })
  .text(40, 560, "New columns cannot be forgotten: the export reads only the inventory, and the check fails while the schema holds anything the inventory does not.\nRetention is a table of rules, run by a batched job; a legal hold wins over a policy.")
  .write(dirname(fileURLToPath(import.meta.url)));
