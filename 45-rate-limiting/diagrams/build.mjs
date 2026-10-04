// node diagrams/build.mjs  ->  overview.excalidraw and overview.svg in this folder.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "45. Rate limiting: one tenant must not starve the others")
  .box("batch", 40, 110, 240, 70, "acme-batch\nignores 429, hammers", { dashed: true })
  .box("sync", 40, 210, 240, 70, "acme-sync\nRetry-After + jitter")
  .box("quiet", 40, 310, 240, 70, "Globex, Initech portals\n20 req/s each")
  .box("limiter", 380, 190, 260, 110, "Limiter\nlocal memory of the last \"no\"\nthen take_tokens()", { bold: true })
  .box("buckets", 380, 380, 260, 80, "Postgres: buckets\none row per tenant and key,\nlocked FOR UPDATE")
  .box("api", 780, 190, 240, 110, "Member API\nshared pool of 4\n(about 200 req/s)", { bold: true })
  .box("r429", 780, 380, 240, 80, "429 + Retry-After\nRateLimit, RateLimit-Policy", { dashed: true })
  .arrow("batch", "limiter")
  .arrow("sync", "limiter")
  .arrow("quiet", "limiter")
  .arrow("limiter", "buckets", { both: true, label: "1 call" })
  .arrow("limiter", "api", { label: "allowed" })
  .arrow("limiter", "r429", { dashed: true, label: "empty" })
  .text(40, 500, "Token bucket per tenant (50/s) and per API key (30/s), taken from both or from neither, in one locked statement.\nThe noisy tenant queues in front of the limiter, not in the pool everyone shares.")
  .write(dirname(fileURLToPath(import.meta.url)));
