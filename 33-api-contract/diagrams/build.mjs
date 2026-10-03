// node diagrams/build.mjs -> overview.excalidraw and overview.svg in this folder.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "33. API contract: one spec, checked from every side")
  .box("docs", 40, 110, 240, 70, "reference page\nRedoc, offline HTML")
  .box("spec", 380, 110, 280, 70, "openapi/v2.yaml\nOpenAPI 3.1, written first", { bold: true })
  .box("client", 760, 110, 260, 70, "generated client\nopenapi-typescript + fetch")
  .box("breaking", 40, 270, 240, 80, "breaking-change check\nv1 -> v2: 0 breaking\nv1 -> draft: 5, exit 1")
  .box("provider", 380, 270, 280, 80, "provider (node:http)\nrequests checked: 400\nresponses checked: 500")
  .box("consumer", 760, 270, 260, 80, "consumer\ntyped calls, warns on\nDeprecation + Sunset")
  .box("contract", 380, 440, 280, 70, "provider contract test\nevery operation, 17 cases")
  .box("drift", 760, 440, 260, 70, "drifted handler\ntaxId leaks, amounts as text", { dashed: true })
  .arrow("spec", "docs", { label: "render" })
  .arrow("spec", "client", { label: "generate" })
  .arrow("spec", "breaking", { fromSide: "bottom", toSide: "right" })
  .arrow("spec", "provider", { label: "routes + schemas" })
  .arrow("client", "consumer")
  .arrow("consumer", "provider", { label: "HTTP" })
  .arrow("contract", "provider", { label: "calls" })
  .arrow("drift", "contract", { dashed: true, label: "fails it" })
  .text(40, 560, "Drift is caught where it starts: the contract test fails on an undocumented field or a wrong type,\nthe breaking-change check fails on a removed field or a new required parameter.")
  .write(dirname(fileURLToPath(import.meta.url)));
