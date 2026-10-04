// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "02. Expand / contract: rename users.name to display_name")
  .frame("bad", 40, 90, 1000, 130, "Before: one step")
  .box("naive", 60, 140, 400, 60, "RENAME name TO display_name", { dashed: true })
  .box("broke", 580, 140, 440, 60, "v1 still running: FAILS,\ncolumn \"name\" does not exist", { dashed: true })
  .arrow("naive", "broke", { dashed: true, label: "instantly" })
  .frame("good", 40, 250, 1000, 200, "After: five phases, each safe for the two versions running")
  .box("p1", 60, 300, 172, 130, "1 Expand\nadd display_name,\nname nullable\n\nv1 + v2")
  .box("p2", 257, 300, 172, 130, "2 Migrate\nbackfill\ndisplay_name\n\nv2")
  .box("p3", 454, 300, 172, 130, "3 Switch reads\nread\ndisplay_name\n\nv2 + v3")
  .box("p4", 651, 300, 172, 130, "4 Stop old writes\ndisplay_name\nNOT NULL\n\nv3 + v4")
  .box("p5", 848, 300, 172, 130, "5 Contract\ndrop name\n\n\nv4")
  .arrow("p1", "p2")
  .arrow("p2", "p3")
  .arrow("p3", "p4")
  .arrow("p4", "p5")
  .text(40, 470, "v2 writes both columns, v3 reads the new one only after the backfill, v4 stops writing the old one.\nOut of order breaks a live version: reads before the backfill show blank names, an early contract breaks v3.")
  .write(dirname(fileURLToPath(import.meta.url)));
