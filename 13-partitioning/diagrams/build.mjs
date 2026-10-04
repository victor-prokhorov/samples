// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "13. Partitioning: one table split in four, on one server")
  .box("app", 40, 200, 200, 90, "App\nonly ever talks\nto orders")
  .box("parent", 310, 200, 260, 90, "orders (no storage)\nPARTITION BY HASH\n(customer_id)", { bold: true })
  .box("p0", 680, 100, 280, 60, "orders_p0: dave, erin")
  .box("p1", 680, 180, 280, 60, "orders_p1: alice, carol")
  .box("p2", 680, 260, 280, 60, "orders_p2: bob")
  .box("p3", 680, 340, 280, 60, "orders_p3: empty (few keys)")
  .arrow("app", "parent")
  .arrow("parent", "p0")
  .arrow("parent", "p1")
  .arrow("parent", "p2")
  .arrow("parent", "p3")
  .box("pruned", 40, 450, 440, 70, "WHERE customer_id = 'alice'\n-> pruned: scans orders_p1 only")
  .box("all", 520, 450, 440, 70, "WHERE item = 'lamp' (no key)\n-> Append over all 4 partitions", { dashed: true })
  .text(40, 550, "Still one server: a transaction across partitions rolls back atomically, a row moves when its key changes.\nNo global index: a UNIQUE must include customer_id. 14 moves each piece to its own server.")
  .write(dirname(fileURLToPath(import.meta.url)));
