// node diagrams/build.mjs -> overview.excalidraw and overview.svg in this folder.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "49. Capstone: the samples' pieces as one member portal")
  .box("browser", 40, 250, 220, 110, "Browser\nEN / FR (25)\nlight / dark (35)\ndesktop / 390 px")
  .box("portal", 360, 220, 330, 170, "Next.js portal (20)\nserver components + actions\ntokens + components (35)\nerror summary, axe = 0 (21)\nICU messages, Intl (25)", { bold: true })
  .box("idp", 820, 70, 280, 90, "IdP: oidc-provider (26)\ncode flow + PKCE")
  .box("pg", 820, 260, 280, 90, "Postgres as role app (37)\nRLS + four eyes")
  .box("events", 820, 450, 280, 90, "events table (29)\none row per action")
  .box("kpi", 820, 620, 280, 90, "KPI page, staff (29)\ntiles: target, owner")
  .box("tests", 360, 500, 330, 90, "Tests (34, 22)\nVitest units, Playwright journeys")
  .arrow("browser", "portal", { label: "HTTP" })
  .arrow("browser", "idp", { label: "sign in at the IdP", via: [[150, 115]] })
  .arrow("portal", "idp", { label: "code -> tokens" })
  .arrow("portal", "pg", { label: "SQL as the user" })
  .arrow("portal", "events", { label: "track()" })
  .arrow("events", "kpi", { label: "SQL" })
  .arrow("tests", "browser", { label: "drives" })
  .text(40, 760, "Three journeys through one product: a member changes bank details (errors, then success) and switches to French;\nan employer admin sees her organisation's members; staff approve the change, never their own, and read the KPIs.\nThe number in each box is the sample that teaches that piece in depth.")
  .write(dirname(fileURLToPath(import.meta.url)));
