// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "19. Leader election: a lease row, terms and a fencing token")
  .box("lease", 40, 110, 300, 330, "leases: one row\nholder, term, expires_at\non the database clock\n\nINSERT ... ON CONFLICT\nDO UPDATE WHERE\nholder = me OR expired\n\nTTL 3s, renew every 1s;\nevery takeover: term + 1", { bold: true })
  .box("a", 440, 110, 280, 90, "replica a: leader, term 4\nruns the job every second", { bold: true })
  .box("b", 440, 230, 280, 90, "replica b: paused after its\nlease check, wakes up\nstill thinking term 3", { dashed: true })
  .box("c", 440, 350, 280, 90, "replica c: kill -9 as leader;\nfollowers waited 3.0s\nfor its lease to expire", { dashed: true })
  .box("ticks", 820, 110, 300, 90, "ticks (no check)\ntakes b's stale write:\ntwo leaders at once", { dashed: true })
  .box("fenced", 820, 230, 300, 90, "fenced_ticks: a trigger\nrejects term 3 < 4 seen\n(stale fencing token)", { bold: true })
  .arrow("a", "lease", { both: true, label: "renew" })
  .arrow("b", "lease", { dashed: true })
  .arrow("c", "lease", { dashed: true })
  .arrow("a", "ticks")
  .arrow("b", "ticks", { dashed: true })
  .arrow("b", "fenced", { dashed: true, label: "term 3" })
  .box("advisory", 820, 350, 300, 90, "Alternative: session lock\npg_try_advisory_lock: no TTL,\nheld while paused, no fencing")
  .text(40, 470, "Without election all three replicas ran the job every second. A lease alone cannot stop a paused leader's\nlate write: self-fencing skips the job after a missed renew, and only the storage checking the term rejects it.")
  .write(dirname(fileURLToPath(import.meta.url)));
