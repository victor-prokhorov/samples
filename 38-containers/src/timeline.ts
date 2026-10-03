// Renders out/switch.html: every request of both cutovers as a bar on its worker's lane, by the colour that served it.
// Failed requests are drawn as a red cross, so the failures do not depend on colour alone. Static: no script.
import { writeFileSync } from "node:fs";
import type { Run } from "./load.js";
import { summarize } from "./load.js";

const W = 1000; // plot width in px
const LANE = 16;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function panel(title: string, run: Run) {
  const workers = Math.max(...run.samples.map((s) => s.worker)) + 1;
  const x = (ms: number) => 70 + (ms / run.durationMs) * W;
  const top = 34;
  const h = top + workers * LANE + 34;
  const bars = run.samples
    .map((s) => {
      const y = top + s.worker * LANE + 3;
      const tip = `<title>worker ${s.worker + 1} ${esc(s.path)}: ${s.status || "no response"} from ${s.upstream || "?"}, ${s.start}-${s.end} ms${s.error ? ` (${esc(s.error)})` : ""}</title>`;
      if (!s.ok) {
        // A thin line for how long the request waited, a cross where it failed.
        const cx = x(s.end);
        return `<g class="fail">${tip}<line class="wait" x1="${x(s.start).toFixed(1)}" y1="${y + 5}" x2="${cx.toFixed(1)}" y2="${y + 5}"/><line x1="${cx - 4}" y1="${y + 1}" x2="${cx + 4}" y2="${y + 9}"/><line x1="${cx - 4}" y1="${y + 9}" x2="${cx + 4}" y2="${y + 1}"/></g>`;
      }
      const w = Math.max(2, x(s.end) - x(s.start) - 1);
      return `<rect class="${s.upstream}" x="${x(s.start).toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="10" rx="2">${tip}</rect>`;
    })
    .join("");
  const lanes = Array.from({ length: workers }, (_, i) => `<text class="axis" x="62" y="${top + i * LANE + 12}" text-anchor="end">${i < run.workers ? `w${i + 1}` : `export ${i - run.workers + 1}`}</text>`).join("");
  const marks = run.marks
    .map((m, i) => `<line class="mark" x1="${x(m.at)}" y1="${top - 6}" x2="${x(m.at)}" y2="${h - 26}"/><text class="note" x="${x(m.at) + 3}" y="${i % 2 ? top - 8 : h - 12}">${esc(m.label)} (${(m.at / 1000).toFixed(1)} s)</text>`)
    .join("");
  const sum = summarize(run);
  return `<section>
  <h2>${esc(title)}</h2>
  <p class="sum">${sum.total} requests, <strong>${sum.failed} failed</strong>. Served by: ${esc(sum.byUpstream)}. Failures: ${esc(sum.failures)}.</p>
  <svg viewBox="0 0 ${W + 90} ${h}" width="${W + 90}" height="${h}" role="img" aria-label="${esc(title)}: ${sum.total} requests, ${sum.failed} failed">
    ${lanes}${bars}${marks}
  </svg>
</section>`;
}

export function writeTimeline(file: string, naive: Run, safe: Run) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Blue-green cutover timeline</title>
<style>
  :root { --surface: #fcfcfb; --ink: #0b0b0b; --muted: #52514e; --blue: #2a78d6; --green: #1baf7a; --fail: #d03b3b; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --surface: #1a1a19; --ink: #ffffff; --muted: #c3c2b7; --blue: #3987e5; --green: #199e70; } }
  :root[data-theme="dark"] { --surface: #1a1a19; --ink: #ffffff; --muted: #c3c2b7; --blue: #3987e5; --green: #199e70; }
  body { margin: 0; padding: 16px 24px; background: var(--surface); color: var(--ink); font: 14px/1.4 system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 18px 0 2px; } .sum { margin: 0 0 4px; color: var(--muted); }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 18px; color: var(--muted); } .legend > span { white-space: nowrap; } .key { display: inline-block; width: 22px; height: 10px; border-radius: 2px; vertical-align: middle; margin-right: 6px; }
  rect.blue { fill: var(--blue); } rect.green { fill: var(--green); } rect { stroke: var(--surface); stroke-width: 1; }
  .fail line { stroke: var(--fail); stroke-width: 2; } .fail line.wait { stroke-width: 1; } .mark { stroke: var(--muted); stroke-dasharray: 4 3; }
  .axis, .note { fill: var(--muted); font-size: 12px; } svg { max-width: 100%; height: auto; display: block; }
</style></head><body>
<h1>Blue-green cutover, request by request</h1>
<div class="legend"><span><span class="key" style="background:var(--blue)"></span>served by blue (1.0.0)</span><span><span class="key" style="background:var(--green)"></span>served by green (1.1.0)</span><span><svg width="14" height="12" style="display:inline;vertical-align:middle"><g class="fail"><line x1="2" y1="1" x2="12" y2="11"/><line x1="2" y1="11" x2="12" y2="1"/></g></svg> failed (502 or 503); thin line = how long it waited</span><span>one lane per load worker; bar = one request, its length the duration</span></div>
${panel("Naive: flip to green at once, SIGKILL blue", naive)}
${panel("Safe: flip when green /readyz says 200, then SIGTERM blue so it drains", safe)}
</body></html>
`;
  writeFileSync(file, html);
}
