// Renders one trace as a static waterfall page (no script), the view Jaeger or Tempo would show:
// one row per span, indented under its parent, a bar from its start to its end on a shared time axis.
// A run of more than five identical sibling spans (same service, name and SQL) is folded into one row
// that draws every one of them as a tick: an N+1 is a comb, not 400 rows.
import type { Span } from "./collector.js";

export type LogLine = Record<string, unknown> & { service?: string; level?: number; msg?: string; trace_id?: string; span_id?: string };

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const LEVELS: Record<number, string> = { 30: "info", 40: "warn", 50: "error" };
const sql = (s: Span) => String(s.attributes["db.query.text"] ?? "");
const key = (s: Span) => `${s.service}|${s.name}|${sql(s)}`;
const label = (s: Span) => (sql(s) ? sql(s).replace(/\s+/g, " ") : s.kind === "CLIENT" && s.attributes["url.path"] ? `${s.name} ${s.attributes["url.path"]}` : s.name);

type Row = { depth: number; spans: Span[]; folded: boolean };

function rows(spans: Span[]): Row[] {
  const children = new Map<string | null, Span[]>();
  const ids = new Set(spans.map((s) => s.spanId));
  for (const s of spans) {
    const parent = s.parentSpanId && ids.has(s.parentSpanId) ? s.parentSpanId : null;
    children.set(parent, [...(children.get(parent) ?? []), s]);
  }
  const out: Row[] = [];
  const walk = (parent: string | null, depth: number) => {
    const kids = (children.get(parent) ?? []).sort((a, b) => a.startMs - b.startMs);
    for (let i = 0; i < kids.length; ) {
      let j = i;
      while (j < kids.length && key(kids[j]) === key(kids[i]) && !children.has(kids[j].spanId)) j++;
      const run = kids.slice(i, Math.max(j, i + 1));
      if (run.length > 5) {
        out.push({ depth, spans: [run[0]], folded: false });
        out.push({ depth, spans: run.slice(1, -1), folded: true });
        out.push({ depth, spans: [run[run.length - 1]], folded: false });
      } else
        for (const s of run) {
          out.push({ depth, spans: [s], folded: false });
          walk(s.spanId, depth + 1);
        }
      i += run.length;
    }
  };
  walk(null, 0);
  return out;
}

// opts.scaleMs draws the axis longer than the trace, to compare two traces on the same scale.
export function waterfall(spans: Span[], logs: LogLine[], opts: { title: string; note: string; scaleMs?: number }) {
  const t0 = Math.min(...spans.map((s) => s.startMs));
  const traceMs = Math.max(...spans.map((s) => s.startMs + s.durationMs)) - t0;
  const total = Math.max(traceMs, opts.scaleMs ?? 0);
  const pct = (ms: number) => ((100 * ms) / total).toFixed(3);
  const root = spans.find((s) => !s.parentSpanId) ?? spans[0];
  const services = [...new Set(spans.map((s) => s.service))];
  const db = spans.filter((s) => s.attributes["db.system.name"]);
  const byQuery = new Map<string, { n: number; ms: number }>();
  for (const s of db) {
    const q = byQuery.get(sql(s)) ?? { n: 0, ms: 0 };
    byQuery.set(sql(s), { n: q.n + 1, ms: q.ms + s.durationMs });
  }
  const cls = (s: Span) => (s.attributes["db.system.name"] ? "db" : s.service) + (s.status === "ERROR" ? " error" : "");
  const axis = [0, 0.25, 0.5, 0.75, 1].map((f) => `<span style="left:${f * 100}%">${Math.round(f * total)} ms</span>`).join("");

  const body = rows(spans)
    .map((r) => {
      const s = r.spans[0];
      const name = r.folded
        ? `<b>&times; ${r.spans.length} more</b> ${esc(label(s))}`
        : `${esc(label(s))}${s.status === "ERROR" ? ` <b class="err">ERROR</b>` : ""}`;
      const bars = r.spans.map((x) => `<i class="${cls(x)}" style="left:${pct(x.startMs - t0)}%;width:max(1px,${pct(x.durationMs)}%)"></i>`).join("");
      const ms = r.folded ? `${r.spans.reduce((a, x) => a + x.durationMs, 0).toFixed(1)} ms in all` : `${s.durationMs.toFixed(1)} ms`;
      return `<tr><td class="svc ${cls(s).split(" ")[0]}">${esc(s.service)}</td><td class="name" style="padding-left:${8 + r.depth * 14}px" title="${esc(label(s))}">${name}</td><td class="lane">${bars}</td><td class="ms">${ms}</td></tr>`;
    })
    .join("\n");

  const queries = [...byQuery.entries()]
    .sort((a, b) => b[1].ms - a[1].ms)
    .map(([q, v]) => `<tr><td class="num">${v.n}</td><td class="num">${v.ms.toFixed(1)} ms</td><td><code>${esc(q)}</code></td></tr>`)
    .join("");
  const events = spans
    .flatMap((s) => s.events.map((e) => ({ s, e })))
    .map(({ s, e }) => `<tr><td>${esc(s.service)}</td><td class="nowrap"><code>${esc(s.spanId)}</code></td><td>${esc(s.name)}</td><td class="err">${esc(e.name)}</td><td><code>${esc(e.attributes["exception.type"] ?? "")}: ${esc(e.attributes["exception.message"] ?? "")}</code></td></tr>`)
    .join("");
  const logRows = [...logs]
    .sort((a, b) => String(a.time).localeCompare(String(b.time)))
    .map((l) => `<tr><td>${esc(l.service)}</td><td class="lvl-${esc(LEVELS[l.level ?? 30])}">${esc(LEVELS[l.level ?? 30])}</td><td class="nowrap"><code>${esc(l.span_id)}</code></td><td class="nowrap">${esc(l.msg)}</td><td><code>${esc(JSON.stringify(Object.fromEntries(Object.entries(l).filter(([k]) => !["level", "time", "service", "trace_id", "span_id", "trace_flags", "msg"].includes(k)))))}</code></td></tr>`)
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
  body { font: 13px/1.4 system-ui, sans-serif; margin: 20px 24px; color: #1b1f24; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 4px; } p { margin: 4px 0 12px; color: #444; }
  .meta span { margin-right: 18px; } code { font: 12px ui-monospace, monospace; }
  table { border-collapse: collapse; width: 100%; } td, th { padding: 3px 6px; text-align: left; vertical-align: middle; }
  .wf td { border-bottom: 1px solid #eef0f2; height: 18px; }
  .wf .svc { width: 44px; font-weight: 600; } .wf .name { width: 470px; max-width: 470px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wf .lane { position: relative; } .wf .ms { width: 110px; text-align: right; color: #555; white-space: nowrap; }
  .lane i { position: absolute; top: 4px; height: 12px; border-radius: 2px; }
  .axis { position: relative; height: 16px; color: #666; font-size: 11px; white-space: nowrap; } .axis span { position: absolute; transform: translateX(-50%); } .nowrap { white-space: nowrap; }
  .axis span:first-child { transform: none; } .axis span:last-child { transform: translateX(-100%); }
  i.web { background: #3b6fd8; } i.api { background: #2f9a5d; } i.db { background: #d9822b; } i.error { outline: 2px solid #c62828; }
  td.web { color: #3b6fd8; } td.api { color: #2f9a5d; } td.db { color: #d9822b; } .err { color: #c62828; }
  .legend i { display: inline-block; position: static; width: 12px; height: 10px; margin: 0 4px 0 12px; border-radius: 2px; }
  h2 { font-size: 15px; margin: 18px 0 6px; } .small td { border-bottom: 1px solid #eef0f2; } .num { text-align: right; white-space: nowrap; width: 80px; }
  .legend { white-space: nowrap; } .small code { word-break: break-all; } .small .nowrap code { word-break: normal; }
  .lvl-warn { color: #9a6700; font-weight: 600; } .lvl-error { color: #c62828; font-weight: 600; }
</style></head><body>
<h1>${esc(opts.title)}</h1>
<p>${esc(opts.note)}</p>
<div class="meta"><span>trace <code>${esc(root.traceId)}</code></span><span>root <b>${esc(root.service)} ${esc(root.name)}</b></span><span><b>${traceMs.toFixed(1)} ms</b>${total > traceMs ? ` (drawn on a ${Math.round(total)} ms axis)` : ""}</span><span>${spans.length} spans</span><span>${db.length} database queries</span><span class="legend"><i class="web"></i>web<i class="api"></i>api<i class="db"></i>postgres query</span></div>
<table class="wf"><tr><td></td><td></td><td class="lane"><div class="axis">${axis}</div></td><td></td></tr>
${body}
</table>
<h2>Queries in this trace</h2>
<table class="small"><tr><th class="num">count</th><th class="num">time</th><th>statement</th></tr>${queries}</table>
${events ? `<h2>Span events</h2>\n<table class="small"><tr><th>service</th><th>span</th><th>span name</th><th>event</th><th>detail</th></tr>${events}</table>` : ""}
<h2>Log lines with this trace id</h2>
<table class="small"><tr><th>service</th><th>level</th><th>span</th><th>message</th><th>fields</th></tr>${logRows}</table>
</body></html>
`;
}
