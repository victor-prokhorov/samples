// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "20. Member portal: server-rendered, works without JavaScript")
  .box("browser", 40, 190, 200, 120, "Browser\nno JavaScript needed:\nGET pages,\nPOST forms")
  .frame("next", 300, 90, 580, 390, "next start :53030 (Next.js App Router)")
  .box("sc", 320, 140, 540, 80, "Server components (profile, contributions):\nasync, query Postgres, return HTML")
  .box("sa", 320, 240, 540, 100, "Server action (the address form posts to it):\nzod validates; invalid -> 200 with the errors;\nvalid -> INSERT, then 303 to /requests/:id")
  .box("sess", 320, 360, 540, 100, "requireMember(): member id from the signed\nHttpOnly cookie, never from the URL or the form;\nOrigin check refuses cross-site actions", { bold: true })
  .box("pg", 960, 200, 260, 140, "Postgres :55451\nevery query filters\non the session's member\npartial unique index:\none pending change")
  .arrow("browser", "next")
  .arrow("sc", "pg")
  .arrow("sa", "pg")
  .box("before", 40, 520, 1180, 60, "Before: a fetch-only form with browser-only validation and the member id taken from the URL:\ndead without JavaScript, skipped by a direct POST, and one member can read another's data", { dashed: true })
  .text(40, 600, "In the run, bob asking for alice's request gets 404, a forged member_id field is ignored, a cross-origin action\nis aborted, and four address submissions (invalid, valid, duplicate, cross-origin) leave exactly one row.")
  .write(dirname(fileURLToPath(import.meta.url)));
