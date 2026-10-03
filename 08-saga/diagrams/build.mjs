// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "08. Orchestrated saga: local transactions + compensations")
  .box("orch", 40, 100, 420, 80, "Orchestrator\nstep table, forward loop, compensation loop", { bold: true })
  .box("log", 540, 100, 300, 80, "Saga log (own database)\nstate + step after every step")
  .box("waker", 920, 100, 240, 80, "Waker\npolls every 5s, claims\ndue sagas, resumes")
  .arrow("orch", "log", { both: true })
  .frame("steps", 40, 220, 1120, 160, "Steps: each a local transaction in its service's database, idempotent by saga id")
  .box("reserve", 60, 270, 240, 80, "1 Reserve stock\ninventory DB")
  .box("charge", 340, 270, 240, 80, "2 Charge\npayments DB")
  .box("hold", 620, 270, 240, 80, "3 fraudHold timer\nstate = waiting, wake_at")
  .box("ship", 900, 270, 240, 80, "4 Ship: the pivot\nshipping DB")
  .arrow("orch", "steps")
  .arrow("waker", "hold")
  .arrow("reserve", "charge")
  .arrow("charge", "hold")
  .arrow("hold", "ship")
  .box("refund", 340, 440, 240, 70, "Refund\n(undoes 2)", { dashed: true })
  .box("release", 60, 440, 240, 70, "Release stock\n(undoes 1)", { dashed: true })
  .arrow("ship", "refund", { dashed: true, label: "shipping fails", via: [[1020, 475], [800, 475]] })
  .arrow("refund", "release", { dashed: true })
  .text(40, 540, "No transaction spans the four databases. A failure runs the compensations in reverse order (a refund is a new fact).\nA crash resumes from the saga log; the fraud hold is a row with wake_at, not a sleeping process.")
  .write(dirname(fileURLToPath(import.meta.url)));
