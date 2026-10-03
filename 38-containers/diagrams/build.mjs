// node diagrams/build.mjs -> overview.excalidraw and overview.svg in this folder.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "38. One image, every machine: build small, switch blue to green without a failed request")
  .frame("img", 40, 90, 420, 400, "Multi-stage build")
  .box("deps", 60, 140, 180, 60, "deps\nnpm ci (dev deps too)")
  .box("build", 60, 240, 180, 60, "build\ntsc -> dist/")
  .box("prod", 260, 140, 180, 60, "prod-deps\nnpm ci --omit=dev")
  .box("runtime", 140, 350, 300, 110, "runtime image\nnode:22-slim pinned by digest\nuid 1000, HEALTHCHECK /healthz\ndist + production node_modules", { bold: true })
  .box("load", 540, 140, 200, 60, "load: 6 workers\n+ 3 long exports")
  .box("proxy", 540, 260, 200, 70, "proxy :53048\nflips on green /readyz 200", { bold: true })
  .box("blue", 800, 170, 220, 70, "blue 1.0.0 :53148\nSIGTERM: drain, exit 0", { dashed: true })
  .box("green", 800, 330, 220, 70, "green 1.1.0 :53248\nwarm-up, then ready")
  .box("pg", 800, 470, 220, 60, "Postgres :55468\n(/readyz checks it)")
  .arrow("deps", "build")
  .arrow("build", "runtime")
  .arrow("prod", "runtime")
  .arrow("runtime", "green", { label: "docker run" })
  .arrow("load", "proxy")
  .arrow("proxy", "blue", { dashed: true, label: "before" })
  .arrow("proxy", "green", { label: "after" })
  .arrow("green", "pg")
  .arrow("blue", "pg", { dashed: true, via: [[1060, 205], [1060, 500]] })
  .text(40, 560, "Naive (one stage, flip at once, SIGKILL): 44 MB of build leftovers, a token in the history, hundreds of failed requests.\nMulti-stage + readiness + graceful SIGTERM: 1 MB on top of the base, nothing secret in the layers, zero failed requests.")
  .write(dirname(fileURLToPath(import.meta.url)));
