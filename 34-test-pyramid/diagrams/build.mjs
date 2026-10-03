// node diagrams/build.mjs -> overview.excalidraw and overview.svg in this folder.
// The counts and times come from out/levels.json and out/coverage/coverage-summary.json, written by the last run.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => (existsSync(join(here, f)) ? JSON.parse(readFileSync(join(here, f), "utf8")) : null);
const levels = Object.fromEntries((read("../out/levels.json") ?? []).map((l) => [l.level, l]));
const n = (id) => (levels[id] ? `: ${levels[id].tests}` : "");
const per = (id) => {
  const l = levels[id];
  if (!l) return "";
  const ms = l.testMs / l.tests;
  return `, ${ms < 10 ? ms.toFixed(1) : ms.toFixed(0)} ms each`;
};
const cov = read("../out/coverage/coverage-summary.json")?.total;

diagram("overview", "34. Test pyramid: many cheap tests, one end-to-end")
  .box("e2e", 290, 110, 220, 60, `End to end${n("e2e")}\nPlaywright${per("e2e")}`, { bold: true })
  .box("api", 230, 190, 340, 60, `API + Postgres${n("api")}\nreal handler, real DB${per("api")}`)
  .box("component", 170, 270, 460, 60, `Component${n("component")}\nReact in jsdom, user-event, MSW${per("component")}`)
  .box("unit", 110, 350, 580, 60, `Unit${n("unit")}\npure rules and calculation${per("unit")}`)
  .box("flaky", 820, 110, 300, 60, "sleep 500 ms, read once\npasses when quick, fails when slow", { dashed: true })
  .box("robust", 820, 230, 300, 60, "web-first assertion\nwaits until it passes: 6 of 6")
  .box("gate", 820, 350, 300, 60, cov ? `coverage gate (v8)\nbranches ${cov.branches.pct}%, floor 87%` : "coverage gate (v8)\nbranches floor 87%")
  .arrow("flaky", "robust", { label: "replace with" })
  .arrow("e2e", "flaky", { dashed: true, label: "waiting, done wrong" })
  .arrow("gate", "unit", { label: "gates" })
  .text(110, 450, "Higher up: fewer tests, each slower and more realistic. Lower down: many tests, each fast and exact.\nA rule is tested at the lowest level that can see it; the browser test only proves the parts are wired.")
  .write(here);
