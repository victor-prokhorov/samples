// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "03. Event sourcing: the events are the source of truth")
  .box("cmd", 40, 110, 180, 80, "Command\nwithdraw 60")
  .box("fold", 270, 110, 220, 80, "Load stream + fold\nevolve(state, event)\nstate at version N")
  .box("decide", 540, 110, 220, 80, "Decide\nbalance >= amount?\nreturns new events")
  .box("append", 810, 110, 220, 80, "Append\nexpectedVersion N", { bold: true })
  .box("store", 810, 260, 220, 90, "events, insert only\nUNIQUE (stream_id,\nversion)", { bold: true })
  .box("conflict", 540, 260, 220, 90, "ConcurrencyError\nversion N+1 taken:\nreload, decide again", { dashed: true })
  .box("proj", 810, 420, 220, 80, "Projection\ntotal deposited = 101")
  .box("tt", 1080, 260, 200, 90, "Time travel\nfold the events\nbefore date T")
  .box("before", 40, 420, 450, 80, "Before: an accounts table holds balance = 11;\nwhich deposits and withdrawals: gone", { dashed: true })
  .arrow("cmd", "fold")
  .arrow("fold", "decide")
  .arrow("decide", "append")
  .arrow("append", "store")
  .arrow("store", "conflict", { dashed: true })
  .arrow("conflict", "fold", { dashed: true, via: [[380, 305]] })
  .arrow("store", "tt")
  .arrow("store", "proj")
  .text(40, 530, "Nothing is updated in place. A rejected command writes nothing; of two concurrent withdrawals of 60\nfrom 71, the loser re-decides against balance 11 and is rejected instead of overdrawing.")
  .write(dirname(fileURLToPath(import.meta.url)));
