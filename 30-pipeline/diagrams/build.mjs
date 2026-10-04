// node diagrams/build.mjs  ->  writes overview.excalidraw and overview.svg in this folder.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

diagram("overview", "30. Pipeline: stages and gates")
  .box("lint", 40, 120, 150, 80, "lint\neslint")
  .box("typecheck", 230, 120, 150, 80, "typecheck\ntsc")
  .frame("test", 420, 90, 220, 220, "test (in parallel)")
  .box("unit", 440, 130, 180, 80, "unit: vitest\ncoverage gate 90%", { bold: true })
  .box("a11y", 440, 225, 180, 70, "a11y: axe-core")
  .box("audit", 680, 120, 160, 80, "audit: npm audit\nblocks releases")
  .box("build", 880, 120, 150, 80, "build\ndist/ artifact")
  .box("deploy", 1070, 105, 210, 110, "deploy: production\napproval, one at a time,\nsmoke test, then\nsymlink switch", { bold: true })
  .box("fail", 380, 370, 300, 70, "pipeline fails:\nlater stages never start", { dashed: true })
  .box("triggers", 900, 360, 380, 90, "schedule (Tue 06:00) or tag vX.Y.Z:\naudit blocks, deploy runs\npush or pull request: checks only")
  .arrow("lint", "typecheck")
  .arrow("typecheck", "test")
  .arrow("test", "audit")
  .arrow("audit", "build")
  .arrow("build", "deploy")
  .arrow("test", "fail", { dashed: true, label: "failing test or coverage below 90%", fromSide: "bottom", toSide: "top" })
  .arrow("lint", "fail", { dashed: true, label: "lint error", fromSide: "bottom", toSide: "left", via: [[115, 405]] })
  .arrow("triggers", "deploy", { label: "rules / if / condition", fromSide: "top", toSide: "bottom" })
  .text(40, 480, "The same stages and gates in .gitlab-ci.yml, github-actions/ci.yml and azure-pipelines.yml (scripts/compare.ts checks it).\nDashed: the failure path. A failed gate stops every later stage; production only changes on a schedule or a release tag.")
  .write(dirname(fileURLToPath(import.meta.url)));
