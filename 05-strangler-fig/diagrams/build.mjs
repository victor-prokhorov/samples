// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "05. Strangler fig: move one route at a time behind a proxy")
  .box("client", 40, 180, 160, 70, "Clients\n(never change)")
  .box("proxy", 280, 180, 240, 70, "Routing proxy :53000\nPUT /_proxy/routes", { bold: true })
  .box("legacy", 640, 100, 300, 70, "Legacy monolith :53001\nunmatched paths", { dashed: true })
  .box("new", 640, 260, 300, 70, "New service :53002\nown model, legacy shape")
  .arrow("client", "proxy")
  .arrow("proxy", "legacy", { dashed: true, via: [[580, 200], [580, 135]] })
  .arrow("proxy", "new", { label: "moved routes", via: [[580, 230], [580, 295]] })
  .box("s1", 40, 400, 210, 80, "1 /orders -> new\nlegacy: 2/3")
  .box("s2", 280, 400, 210, 80, "2 roll back, one call\nlegacy: 3/3")
  .box("s3", 520, 400, 210, 80, "3 + /invoices\nlegacy: 1/3")
  .box("s4", 760, 400, 210, 80, "4 + /users\nlegacy: 0/3", { bold: true })
  .arrow("s1", "s2")
  .arrow("s2", "s3")
  .arrow("s3", "s4")
  .text(40, 365, "Requests legacy still handles, step by step:")
  .text(40, 500, "Every proxied response is checked against legacy's recorded contract (status and body).\nWhen legacy handles 0 requests and nothing bypasses the proxy, it can be switched off.")
  .write(dirname(fileURLToPath(import.meta.url)));
