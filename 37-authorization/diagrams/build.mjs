// node diagrams/build.mjs  ->  overview.excalidraw and overview.svg in this folder.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "37. Authorization: one policy, a matrix, the same rules in RLS")
  .box("before", 40, 110, 260, 70, "before: 8 handlers, 10 role checks,\none route with none", { dashed: true })
  .box("owner", 450, 110, 220, 70, "Postgres as table owner\nchecks nothing", { dashed: true })
  .box("req", 40, 270, 140, 70, "request\nx-user: ana")
  .box("route", 230, 270, 170, 70, "route declares\nits action")
  .box("can", 450, 260, 250, 90, "can(user, action, resource)\nRBAC roles + ABAC conditions\ndeny by default", { bold: true })
  .box("handler", 760, 270, 160, 70, "handler\nas role app")
  .box("rls", 1000, 270, 180, 70, "Postgres RLS\nthe same rules", { bold: true })
  .box("matrix", 450, 440, 250, 70, "matrix, generated\nout/matrix.md + .html")
  .box("tests", 1000, 440, 180, 70, "tests: expectations,\ncode = RLS per cell")
  .arrow("before", "owner", { dashed: true, label: "7 of 63 wrong" })
  .arrow("req", "route")
  .arrow("route", "can")
  .arrow("can", "handler", { label: "allow" })
  .arrow("handler", "rls", { label: "SQL" })
  .arrow("can", "matrix", { label: "every cell" })
  .arrow("matrix", "tests")
  .arrow("rls", "tests")
  .text(40, 560, "Before, each handler checks roles its own way and the database trusts the app. After, one policy decides,\nthe matrix is generated from it, and RLS enforces the same rules: a bug in the code is refused by the database.")
  .write(dirname(fileURLToPath(import.meta.url)));
