// node diagrams/build.mjs  ->  overview.excalidraw and overview.svg in this folder.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "40. Feature flags: change behaviour without a deploy")
  .box("admin", 40, 110, 240, 70, "Release manager, on-call\nsetFlag(actor, reason)")
  .box("pg", 380, 110, 260, 70, "Postgres: flags\n+ flag_audit (trigger)", { bold: true })
  .box("api", 820, 110, 260, 70, "Statement API\nFlagClient, cache TTL 5 s", { bold: true })
  .box("members", 1180, 110, 200, 70, "Members of Acme,\nGlobex, Initech")
  .box("eval", 820, 250, 260, 100, "Evaluate locally:\nrelease toggle\n% rollout (stable hash)\ntenant list, kill switch", { align: "left" })
  .box("registry", 40, 250, 240, 70, "src/registry.ts\nkey, kind, owner, expiry")
  .box("lint", 40, 400, 240, 70, "lint-flags in CI\nexpired + referenced = fail")
  .box("code", 380, 400, 260, 70, "The code\ngetBooleanValue(key, ...)")
  .arrow("admin", "pg", { label: "UPDATE" })
  .arrow("pg", "api", { label: "NOTIFY + read" })
  .arrow("members", "api", { label: "GET" })
  .arrow("api", "eval")
  .arrow("registry", "pg", { label: "seeds", fromSide: "right", toSide: "bottom", via: [[510, 285]] })
  .arrow("registry", "lint")
  .arrow("lint", "code", { label: "scans" })
  .text(40, 510, "A flip is a row update: the trigger audits it and NOTIFY drops the cached copy, so the next evaluation sees it.\nbucket = sha256(flag key : member id) mod 10000, so a member keeps the feature as the percentage grows.")
  .write(dirname(fileURLToPath(import.meta.url)));
