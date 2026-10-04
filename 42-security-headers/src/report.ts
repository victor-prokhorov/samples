// out/header-grades.html: the before/after grade table as a page, for the screenshot.
// out/csp-reports.html: the violation reports the hardened portal collected.
import { writeFileSync } from "node:fs";
import type { CspReport } from "./portal.js";
import type { Finding } from "./scan.js";

export function writeReports(file: string, reports: CspReport[]) {
  const rows = reports
    .map((r) => `<tr><td>${esc(r.at.slice(11, 23))}</td><td><code>${esc(r.directive)}</code></td><td><code>${esc(r.blocked)}</code></td><td>${esc(r.document)}</td><td><code>${esc(r.sample)}</code></td></tr>`)
    .join("\n");
  writeFileSync(
    file,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CSP reports</title><style>
:root { --surface: #fcfcfb; --ink: #0b0b0b; --muted: #52514e; --line: #ddd; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --surface: #1a1a19; --ink: #fff; --muted: #c3c2b7; --line: #444; } }
:root[data-theme="dark"] { --surface: #1a1a19; --ink: #fff; --muted: #c3c2b7; --line: #444; }
body { margin: 0; padding: 16px 24px; background: var(--surface); color: var(--ink); font: 14px/1.4 system-ui, sans-serif; }
h1 { font-size: 20px; margin: 0 0 4px; } p { color: var(--muted); margin: 0 0 10px; }
table { border-collapse: collapse; } th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--line); } th { font-size: 13px; color: var(--muted); }
</style></head><body><h1>CSP violation reports received by POST /csp-report (hardened build)</h1>
<p>${reports.length} reports. The browser blocked the injected inline script on every page view, and the framing attempt.</p>
<table><thead><tr><th>time (UTC)</th><th>directive</th><th>blocked</th><th>page</th><th>script sample (first 40 chars)</th></tr></thead><tbody>
${rows}
</tbody></table></body></html>
`,
  );
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function writeGrades(file: string, a: { score: number; letter: string; findings: Finding[] }, b: { score: number; letter: string; findings: Finding[] }) {
  const rows = a.findings
    .map((f, i) => {
      const g = b.findings[i];
      const cell = (x: Finding) => `<td class="${x.points ? "pass" : "fail"}"><span class="mark">${x.points ? "pass" : "fail"}</span> ${x.points}/${x.max}<div class="seen">${esc(x.seen.length > 70 ? x.seen.slice(0, 67) + "..." : x.seen)}</div></td>`;
      return `<tr><th scope="row">${esc(f.check)}</th>${cell(f)}${cell(g)}</tr>`;
    })
    .join("\n");
  writeFileSync(
    file,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Header grades</title><style>
:root { --surface: #fcfcfb; --ink: #0b0b0b; --muted: #52514e; --good: #0ca30c; --bad: #d03b3b; --line: #ddd; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --surface: #1a1a19; --ink: #fff; --muted: #c3c2b7; --line: #444; } }
:root[data-theme="dark"] { --surface: #1a1a19; --ink: #fff; --muted: #c3c2b7; --line: #444; }
body { margin: 0; padding: 16px 24px; background: var(--surface); color: var(--ink); font: 14px/1.4 system-ui, sans-serif; }
h1 { font-size: 20px; margin: 0 0 10px; } table { border-collapse: collapse; width: 100%; max-width: 1000px; }
th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--line); vertical-align: top; } thead th { font-size: 13px; color: var(--muted); }
.mark { font-weight: 600; } .pass .mark { color: var(--good); } .fail .mark { color: var(--bad); } .pass .mark::before { content: "\\2713 "; } .fail .mark::before { content: "\\2717 "; }
.seen { color: var(--muted); font-size: 12px; font-family: ui-monospace, monospace; word-break: break-all; }
.total th, .total td { font-size: 16px; font-weight: 700; border-bottom: 0; white-space: nowrap; }
</style></head><body><h1>Security header scan: insecure build versus hardened build</h1>
<table><thead><tr><th>Check</th><th>insecure :53052</th><th>hardened :53152</th></tr></thead><tbody>
${rows}
<tr class="total"><th scope="row">Score and grade</th><td>${a.score}/100 grade ${a.letter}</td><td>${b.score}/100 grade ${b.letter}</td></tr>
</tbody></table></body></html>
`,
  );
}
