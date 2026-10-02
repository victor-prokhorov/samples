import axe from "axe-core";
import { JSDOM, VirtualConsole } from "jsdom";
import { mkdir, writeFile } from "node:fs/promises";
import { statementPage } from "../src/page.js";

const html = statementPage("alice", 2026, [{ month: "2026-01", employer: "Acme", amountCents: 41250 }]);
// jsdom has no layout or canvas, so axe skips colour contrast here; a browser run (21) covers it
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
dom.window.eval(axe.source);
const run = (dom.window as unknown as { axe: typeof axe }).axe.run(dom.window.document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] });
const results = await run;
await mkdir("reports", { recursive: true });
await writeFile("reports/a11y.json", JSON.stringify(results.violations, null, 2));
console.log(`axe-core ${axe.version} on the statement page: ${results.passes.length} rules passed, ${results.violations.length} violated`);
for (const v of results.violations) console.log(`  ${v.id} (${v.impact}): ${v.help}, ${v.nodes.length} node(s)`);
process.exit(results.violations.length ? 1 : 0);
