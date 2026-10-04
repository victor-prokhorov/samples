// The contrast gate: for every theme, every foreground/background pair in tokens/contrast.pairs.json, the WCAG ratio
// of the resolved colours against the minimum for its usage (text 4.5:1, large text and UI 3:1). Exits 1 on any failure,
// and on any text or border token that is in no pair (so a new token cannot skip the check).
// Usage: tsx src/tokens/contrast-check.ts [--proposal file]... [--html out/contrast.html]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { THEMES, TOKENS, type Theme, hexOf, loadTheme, resolve } from "./dtcg.js";
import { MINIMUM, type Usage, contrastRatio, format } from "./wcag.js";

interface PairsFile {
  pairs: { fg: string; usage: Usage; on: string[] }[];
  decorative: string[];
}

export interface Result {
  theme: Theme;
  fg: string;
  bg: string;
  usage: Usage;
  fgHex: string;
  bgHex: string;
  fgFrom: string; // the primitive the alias chain ends at
  ratio: number;
  min: number;
  pass: boolean;
}

export function checkContrast(proposals: string[] = []): { results: Result[]; unchecked: string[] } {
  const spec = JSON.parse(readFileSync(join(TOKENS, "contrast.pairs.json"), "utf8")) as PairsFile;
  const results: Result[] = [];
  const unchecked = new Set<string>();
  for (const theme of THEMES) {
    const tokens = loadTheme(theme, proposals);
    const covered = new Set([...spec.pairs.map((p) => p.fg), ...spec.decorative]);
    for (const name of tokens.keys()) if (/^color\.(text|border)\./.test(name) && !covered.has(name)) unchecked.add(name);
    for (const p of spec.pairs)
      for (const bg of p.on) {
        const [fgHex, bgHex] = [hexOf(tokens, p.fg), hexOf(tokens, bg)];
        const ratio = contrastRatio(fgHex, bgHex);
        const min = MINIMUM[p.usage];
        // Compare the truncated ratio: 4.499:1 is not "at least 4.5:1".
        const pass = Math.floor(ratio * 100) / 100 >= min;
        results.push({ theme, fg: p.fg, bg, usage: p.usage, fgHex, bgHex, fgFrom: resolve(tokens, p.fg).chain.at(-1)!, ratio, min, pass });
      }
  }
  return { results, unchecked: [...unchecked] };
}

const short = (n: string) => n.replace(/^color\./, "");

export function printResults(results: Result[], { failuresOnly = false } = {}) {
  for (const r of results) {
    if (failuresOnly && r.pass) continue;
    console.log(
      `   ${r.pass ? "pass" : "FAIL"}  ${r.theme.padEnd(5)}  ${short(r.fg).padEnd(18)} on ${short(r.bg).padEnd(18)} ${r.fgHex} / ${r.bgHex}  ${format(r.ratio).padStart(7)}  (min ${r.min}:1 ${r.usage})`,
    );
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// A static report: one row per pair, with the two colours drawn as they are used.
export function contrastHtml(results: Result[], title: string): string {
  const failed = results.filter((r) => !r.pass).length;
  // Failures first, so the top of the report is what needs fixing.
  const rows = [...results]
    .sort((a, b) => Number(a.pass) - Number(b.pass))
    .map(
      (r) => `<tr class="${r.pass ? "" : "fail"}"><td>${r.theme}</td>
<td><span class="sample" style="background:${r.bgHex};color:${r.fgHex};${r.usage === "ui" ? `box-shadow:inset 0 0 0 2px ${r.fgHex}` : ""}">${r.usage === "ui" ? "&nbsp;" : "Aa"}</span></td>
<td><code>${esc(short(r.fg))}</code><br><small>${r.fgHex} (${esc(r.fgFrom)})</small></td><td><code>${esc(short(r.bg))}</code><br><small>${r.bgHex}</small></td>
<td>${r.usage}</td><td class="num">${format(r.ratio)}</td><td class="num">${r.min}:1</td><td>${r.pass ? "Pass" : "<strong>Fail</strong>"}</td></tr>`,
    )
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;margin:24px;color:#181c22;background:#fff}
h1{font-size:22px;margin:0 0 4px}p{margin:0 0 16px;color:#525a66}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #dde1e7;vertical-align:middle}
th{font-size:13px;color:#525a66;font-weight:600}td.num{font-variant-numeric:tabular-nums;text-align:right}
tr.fail td{background:#fdf2f2}tr.fail td:last-child{color:#a32222}
.sample{display:inline-block;width:44px;height:28px;line-height:28px;text-align:center;border-radius:4px;font-weight:600;outline:1px solid #dde1e7}
code{font-size:13px}small{color:#525a66}
</style></head><body>
<h1>${esc(title)}</h1>
<p>${results.length} pairs checked, ${failed} below the minimum. Ratio per WCAG 2.2 (1.4.3 text 4.5:1, 1.4.11 UI 3:1), truncated to two decimals.</p>
<table><thead><tr><th>Theme</th><th>Sample</th><th>Foreground</th><th>Background</th><th>Usage</th><th>Ratio</th><th>Minimum</th><th>Result</th></tr></thead>
<tbody>
${rows}
</tbody></table></body></html>
`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const proposals = args.flatMap((a, i) => (args[i - 1] === "--proposal" ? [resolvePath(a)] : []));
  const htmlIdx = args.indexOf("--html");
  const { results, unchecked } = checkContrast(proposals);
  printResults(results, { failuresOnly: args.includes("--failures-only") });
  const failed = results.filter((r) => !r.pass);
  for (const u of unchecked) console.log(`   FAIL  ${u} is used by no pair in tokens/contrast.pairs.json and is not marked decorative`);
  if (htmlIdx >= 0) {
    const out = resolvePath(args[htmlIdx + 1]);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, contrastHtml(results, proposals.length ? `Contrast check with ${proposals.map((p) => p.split("/").pop()).join(", ")}` : "Contrast check: committed tokens"));
  }
  console.log(`   contrast: ${results.length} pairs in ${THEMES.length} themes, ${failed.length} below the minimum, ${unchecked.length} unchecked tokens`);
  if (failed.length || unchecked.length) process.exitCode = 1;
}
