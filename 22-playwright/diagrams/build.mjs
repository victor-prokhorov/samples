// node diagrams/build.mjs -> writes overview.excalidraw and overview.svg next to this file (tools/diagrams/build-all.mjs runs it too).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { diagram } from "../../tools/diagrams/lib.mjs";

const rows = [
  ["page.waitForTimeout(500), then read once:\npasses at 100 ms, fails at 1500 ms", "expect(locator).toHaveText(...)\nretries: passes at both speeds"],
  ["CSS path #login-form > div:nth-child(1):\nbreaks on a markup refactor", "getByRole / getByLabel:\nsurvive it, like a user would"],
  ["no per-test reset: the second test\ncounts the first one's row (3, not 2)", "an automatic fixture truncates\nthe tables before every test"],
];
const d = diagram("overview", "22. Playwright: isolated, fast, trustworthy browser tests")
  .box("unit", 40, 100, 340, 80, "Vitest: the rule checkRequest()\nevery boundary, in milliseconds")
  .box("setup", 440, 100, 260, 80, "setup project: signs in\nonce, saves storageState")
  .box("worker", 780, 100, 400, 80, "each worker: CREATE DATABASE ... TEMPLATE\n+ its own app server on a free port", { bold: true })
  .arrow("setup", "worker", { label: "cookie" })
  .text(40, 220, "Flaky, brittle or leaky", { bold: true })
  .text(660, 220, "Trustworthy", { bold: true });
rows.forEach(([bad, good], i) => {
  const y = 260 + i * 100;
  d.box(`b${i}`, 40, y, 500, 75, bad, { dashed: true }).box(`g${i}`, 660, y, 520, 75, good).arrow(`b${i}`, `g${i}`);
});
d.text(40, 570, "Traces are kept only for failed tests; they record the session cookie, so they stay out of git.\nThe JSON report of every run is committed, and the HTML report of each run is rendered.")
  .write(dirname(fileURLToPath(import.meta.url)));
