// node diagrams/build.mjs -> overview.excalidraw and overview.svg in this folder.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "39. Web performance: measure, budget, fix")
  .box("slow", 40, 110, 260, 120, "/slow/  before\nblocking CSS + JS in <head>\n5.5 MB PNG, no size\n467 kB bundle, late banner", { dashed: true })
  .box("fast", 40, 270, 260, 120, "/fast/  after\ninline CSS, preloaded\n2 kB AVIF with its size\n7 kB module, server-rendered", { bold: true })
  .box("server", 360, 190, 200, 120, "Member page\nnode:http :53049")
  .box("bundle", 640, 90, 260, 70, "esbuild metafile\nbundle-size budget")
  .box("lh", 640, 190, 260, 70, "Lighthouse, headless (lab)\nLCP, CLS, TBT, JS bytes")
  .box("visits", 640, 290, 260, 70, "Chromium visits, 3 profiles\nweb-vitals in the page")
  .box("rum", 640, 410, 260, 70, "Collector :53149\nsendBeacon -> vitals.ndjson")
  .box("budgets", 980, 230, 220, 120, "budgets.json\nslow: 8 over budget\nfast: all pass", { bold: true })
  .arrow("slow", "server")
  .arrow("fast", "server")
  .arrow("server", "lh")
  .arrow("server", "visits")
  .arrow("visits", "rum", { label: "beacons" })
  .arrow("bundle", "budgets")
  .arrow("lh", "budgets")
  .arrow("rum", "budgets", { label: "p75" })
  .text(40, 440, "The same budgets judge three views of one page:\nthe build (bytes), the lab (one synthetic phone),\nthe field (p75 of real visits).")
  .write(dirname(fileURLToPath(import.meta.url)));
