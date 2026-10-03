// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "04. Parallel run: check a rewrite on real inputs")
  .box("req", 40, 200, 180, 80, "Request\n1000 seeded\norders")
  .box("exp", 280, 200, 200, 80, "Experiment\nruns both,\nrandom order", { bold: true })
  .box("ctl", 560, 130, 260, 70, "Control: legacy\nits result is served")
  .box("cand", 560, 280, 260, 70, "Candidate: rewrite\nexceptions swallowed", { dashed: true })
  .box("cmp", 900, 200, 200, 80, "Compare\ndeep equality")
  .box("log", 900, 350, 200, 90, "Mismatch log\nwith the input\nv1: 567, v2: 0")
  .box("cut", 40, 370, 440, 70, "Cutover: swap the roles\nrewrite serves, legacy becomes the check")
  .arrow("req", "exp")
  .arrow("exp", "ctl")
  .arrow("exp", "cand")
  .arrow("ctl", "cmp")
  .arrow("cand", "cmp")
  .arrow("cmp", "log")
  .arrow("ctl", "req", { via: [[690, 95], [130, 95]], label: "served to the user" })
  .text(40, 470, "Users always get the legacy answer while the rewrite is checked. v1 disagreed on 567 of 1000 orders\n(three bugs: empty carts, the >= threshold, rounding); v2 on 0, then the roles swap.")
  .write(dirname(fileURLToPath(import.meta.url)));
