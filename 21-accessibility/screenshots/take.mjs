// Screenshots of both forms after a failed submit (out/*-errors.html, as the server sent them) and a table of the axe results
// (out/axe-*.json). Run by ../run.sh after the demo has written out/.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { withPage } from "../../tools/render.mjs";

const here = new URL(".", import.meta.url);
const out = (name) => new URL(`./${name}.png`, here).pathname;
const file = (name) => pathToFileURL(new URL(`../out/${name}`, here).pathname).href;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const scans = [
  ["/bad, empty form", "axe-bad-empty.json"],
  ["/bad, after a failed submit", "axe-bad-errors.json"],
  ["/good, empty form", "axe-good-empty.json"],
  ["/good, after a failed submit", "axe-good-errors.json"],
];
const rows = scans
  .map(([state, name]) => {
    const r = JSON.parse(readFileSync(new URL(`../out/${name}`, here), "utf8"));
    const list = r.violations
      .map((v) => `${esc(v.id)} <span>${esc(v.impact)}, WCAG ${v.tags.filter((t) => /^wcag\d{3,}$/.test(t)).map((t) => t.slice(4).split("").join(".")).join(", ")}, ${v.nodes.length} node(s)</span>`)
      .join("<br>");
    return `<tr><td>${esc(state)}</td><td class="n">${r.violations.length}</td><td class="n">${r.passes.length}</td><td>${list || "none"}</td></tr>`;
  })
  .join("");
const table = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  body { font-family: sans-serif; margin: 0; color: #0b0c0c; } #c { display: inline-block; padding: 1.5rem; }
  h1 { font-size: 1.3rem; margin: 0 0 1rem; }
  table { border-collapse: collapse; } th, td { text-align: left; vertical-align: top; padding: .5rem .8rem; border-bottom: 1px solid #b1b4b6; }
  td.n { text-align: right; } span { color: #505a5f; }
</style></head><body><div id="c"><h1>axe-core scans, WCAG 2.0, 2.1 and 2.2 A and AA rules</h1>
<table><thead><tr><th>Page state</th><th>Violations</th><th>Rules passed</th><th>Violated rules</th></tr></thead><tbody>${rows}</tbody></table></div></body></html>`;

await withPage(
  async (page) => {
    await page.goto(file("bad-errors.html"));
    await page.screenshot({ path: out("bad-errors"), fullPage: true });
    await page.goto(file("good-errors.html"));
    await page.screenshot({ path: out("good-errors"), fullPage: true });
    await page.setViewportSize({ width: 1000, height: 400 });
    await page.setContent(table);
    await page.locator("#c").screenshot({ path: out("axe-results") });
  },
  { width: 820, height: 600 },
);
