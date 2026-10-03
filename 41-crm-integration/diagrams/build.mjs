// node diagrams/build.mjs  ->  overview.excalidraw and overview.svg in this folder.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "41. A partner CRM behind an anti-corruption layer")
  .box("crm", 30, 140, 210, 110, "Fake CRM (OData v4)\nPascalCase fields,\noption-set codes,\n429 / 503, ETags")
  .frame("acl", 362, 100, 606, 350, "Anti-corruption layer")
  .box("client", 380, 140, 250, 110, "CRM client\npaging by @odata.nextLink,\nretries honour Retry-After,\nIf-Match on PATCH")
  .box("translator", 700, 140, 250, 110, "Translator\nfields and codes to\nMember, Employer;\ndomain invariants")
  .box("verifier", 380, 330, 250, 100, "Webhook verifier\nHMAC-SHA256, 300 s window,\ndedupe by event id")
  .box("quarantine", 700, 330, 250, 80, "Quarantine\nreasons + raw record", { dashed: true })
  .box("domain", 1030, 140, 230, 110, "Domain\nMember, Employer\nno CRM shapes", { bold: true })
  .box("pg", 1030, 330, 230, 100, "Postgres local copy\nhigh-water mark,\ninbox, source links")
  .box("recon", 380, 500, 880, 70, "Nightly reconciliation: counts and checksums, CRM versus local copy, by employer then by member -> drift report")
  .arrow("crm", "client", { label: "OData JSON" })
  .arrow("client", "translator")
  .arrow("translator", "domain")
  .arrow("translator", "quarantine", { dashed: true, label: "invalid" })
  .arrow("domain", "pg", { label: "upsert, version guard" })
  .arrow("crm", "verifier", { label: "signed webhook" })
  .arrow("verifier", "client", { label: "re-read the record" })
  .arrow("recon", "pg", { label: "compare" })
  .arrow("recon", "crm", { via: [[135, 535]], label: "compare" })
  .text(40, 610, "Sync and webhooks only see what ModifiedOn and notifications show; reconciliation finds the rest (hard deletes, backdated imports, hand edits).\nThe domain imports nothing from the layer: a checked dependency rule.")
  .write(dirname(fileURLToPath(import.meta.url)));
