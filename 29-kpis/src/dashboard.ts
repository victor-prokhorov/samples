import { SLO, fmt } from "./kpis.js";
import type { Day, FunnelStep, Result, RouteLatency } from "./report.js";

type Data = { window: { from: Date; to: Date }; results: Result[]; funnel: FunnelStep[]; daily: Day[]; latency: RouteLatency[] };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function tiles(results: Result[]) {
  return results
    .map(
      (r) => `<div class="tile">
  <div class="name">${esc(r.kpi.name)}</div>
  <div class="value">${fmt(r.kpi.unit, r.value)}</div>
  <div class="status ${r.met ? "good" : "bad"}"><span aria-hidden="true">${r.met ? "&#10003;" : "&#10007;"}</span> ${r.met ? "Met" : "Missed"}: target ${esc(r.kpi.target.op)} ${fmt(r.kpi.unit, r.kpi.target.value)}</div>
  <div class="meta">${esc(r.detail)} &middot; owner: ${esc(r.kpi.owner)}</div>
</div>`,
    )
    .join("\n");
}

// Horizontal bars: one row per item, label left, value right, optional target line.
function hbars(items: { label: string; value: number; text: string; tip: string }[], max: number, target?: { value: number; label: string }) {
  const row = 30;
  const [x0, w] = [170, 520];
  const h = items.length * row + (target ? 22 : 6);
  const bars = items
    .map((it, i) => {
      const y = i * row + 4;
      const bw = Math.max(2, (it.value / max) * w);
      return `<g><title>${esc(it.tip)}</title>
  <text x="${x0 - 8}" y="${y + 15}" text-anchor="end" class="label">${esc(it.label)}</text>
  <rect x="${x0}" y="${y + 3}" width="${bw.toFixed(1)}" height="18" rx="4" class="bar"/>
  <text x="${(x0 + bw + 6).toFixed(1)}" y="${y + 16}" class="label">${esc(it.text)}</text></g>`;
    })
    .join("\n");
  const t = target
    ? `<line x1="${x0 + (target.value / max) * w}" x2="${x0 + (target.value / max) * w}" y1="0" y2="${items.length * row + 6}" class="target"/>
  <text x="${x0 + (target.value / max) * w}" y="${items.length * row + 18}" text-anchor="middle" class="muted">${esc(target.label)}</text>`
    : "";
  return `<svg viewBox="0 0 960 ${h}" role="img" width="100%">${bars}${t}</svg>`;
}

function failedPerDay(days: Day[]) {
  const max = Math.max(1, ...days.map((d) => d.failed));
  const [w, h, gap] = [960, 160, 2];
  const bw = w / days.length - gap;
  const bars = days
    .map((d, i) => {
      const bh = (d.failed / max) * (h - 30);
      const x = i * (bw + gap);
      return `<g><title>${d.day}: ${d.failed} failed of ${d.requests} requests</title>
  <rect x="${x.toFixed(1)}" y="${h - 20 - Math.max(bh, d.failed ? 2 : 0)}" width="${bw.toFixed(1)}" height="${Math.max(bh, d.failed ? 2 : 0)}" rx="2" class="${d.failed ? "fail" : "bar"}"/>
  ${i % 7 === 0 ? `<text x="${x.toFixed(1)}" y="${h - 4}" class="muted">${d.day}</text>` : ""}
  ${d.failed === max ? `<text x="${(x + bw + 4).toFixed(1)}" y="${h - 20 - bh + 10}" class="label">${d.day}: ${d.failed} failed</text>` : ""}</g>`;
    })
    .join("\n");
  return `<svg viewBox="0 0 ${w} ${h}" role="img" width="100%"><line x1="0" x2="${w}" y1="${h - 20}" y2="${h - 20}" class="axis"/>${bars}</svg>`;
}

export function dashboard({ window, results, funnel, daily, latency }: Data) {
  const top = funnel[0].sessions;
  const funnelBars = hbars(
    funnel.map((f, i) => ({
      label: f.step,
      value: f.sessions,
      text: `${f.sessions} (${((100 * f.sessions) / top).toFixed(0)}%)${i ? `; -${((100 * (funnel[i - 1].sessions - f.sessions)) / funnel[i - 1].sessions).toFixed(0)}% from the step above` : ""}`,
      tip: `${f.step}: ${f.sessions} sessions`,
    })),
    top,
  );
  const latencyBars = hbars(
    latency.map((l) => ({ label: l.route, value: l.p95, text: `p95 ${l.p95} ms, mean ${l.mean} ms`, tip: `${l.route}: ${l.requests} requests` })),
    Math.max(400, ...latency.map((l) => l.p95)),
    { value: 300, label: "target 300 ms" },
  );
  const budget = results.find((r) => r.kpi.id === "error_budget")!;
  const definitions = results
    .map((r) => `<tr><td>${esc(r.kpi.name)}</td><td>${esc(r.kpi.question)}</td><td>${esc(r.kpi.formula)}</td><td>${esc(r.kpi.target.op)} ${fmt(r.kpi.unit, r.kpi.target.value)}</td><td>${esc(r.kpi.owner)}</td></tr>`)
    .join("\n");
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Member portal KPIs</title>
<style>
:root { color-scheme: light; --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #6b6a66; --line: #e1e0d9; --axis: #c3c2b7; --series: #2a78d6; --good: #006300; --bad: #b42323; --fail: #d03b3b; }
@media (prefers-color-scheme: dark) {
  :root { color-scheme: dark; --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink-2: #c3c2b7; --muted: #a09f99; --line: #2c2c2a; --axis: #383835; --series: #3987e5; --good: #0ca30c; --bad: #e66767; --fail: #e66767; }
}
body { margin: 0; padding: 24px 16px; background: var(--page); color: var(--ink); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1000px; margin: 0 auto; }
h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 28px 0 8px; }
p { color: var(--ink-2); margin: 0 0 12px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); gap: 12px; }
.tile, .panel { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
.name { color: var(--ink-2); font-size: 13px; } .value { font-size: 28px; font-weight: 600; }
.status { font-size: 13px; font-weight: 600; } .good { color: var(--good); } .bad { color: var(--bad); }
.meta { color: var(--muted); font-size: 12px; margin-top: 4px; }
svg text { font: 12px system-ui, sans-serif; } .label { fill: var(--ink-2); } .muted { fill: var(--muted); }
.bar { fill: var(--series); } .fail { fill: var(--fail); } .axis { stroke: var(--axis); } .target { stroke: var(--ink-2); stroke-dasharray: 4 3; }
table { border-collapse: collapse; width: 100%; font-size: 13px; background: var(--surface); }
th, td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid var(--line); }
.scroll { overflow-x: auto; }
</style>
</head>
<body>
<main>
<h1>Member portal KPIs</h1>
<p>Window ${day(window.from)} to ${day(new Date(window.to.getTime() - 1))} (28 days). Every number below comes from the SQL in <code>src/kpis.ts</code>.</p>
<div class="tiles">
${tiles(results)}
</div>
<h2>Change request funnel (sessions)</h2>
<div class="panel">${funnelBars}</div>
<h2>Failed member requests per day (SLO ${SLO}%, ${esc(budget.detail)})</h2>
<div class="panel">${failedPerDay(daily)}</div>
<h2>Latency by route</h2>
<div class="panel">${latencyBars}</div>
<h2>Definitions</h2>
<div class="scroll"><table>
<thead><tr><th>KPI</th><th>Question it answers</th><th>Formula</th><th>Target</th><th>Owner</th></tr></thead>
<tbody>
${definitions}
</tbody>
</table></div>
</main>
</body>
</html>
`;
}
