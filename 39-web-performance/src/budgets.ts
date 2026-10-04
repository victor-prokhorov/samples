// Budget checks: the same budgets.json judges the bundle (at build time), the lab run (Lighthouse) and the field (p75).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type { LabSummary } from "./lighthouse.js";
import { DIST, ROOT } from "./paths.js";

interface Limit {
  max: number;
  unit: string;
}

export const BUDGETS = JSON.parse(readFileSync(join(ROOT, "budgets.json"), "utf8")) as {
  lab: Record<string, Limit>;
  field: Record<string, Limit>;
  bundle: Record<string, { maxGzip: number }>;
};

export interface Verdict {
  scope: "bundle" | "lab" | "field";
  page: string;
  metric: string;
  value: number;
  max: number;
  unit: string;
  pass: boolean;
}

const verdict = (scope: Verdict["scope"], page: string, metric: string, value: number, max: number, unit: string): Verdict => ({ scope, page, metric, value, max, unit, pass: value <= max });

// The bundle budget reads esbuild's metafile: the size of each output and which inputs it is made of.
export function bundleBudget(page: "slow" | "fast") {
  const meta = JSON.parse(readFileSync(join(DIST, `meta-${page}.json`), "utf8")) as {
    outputs: Record<string, { bytes: number; inputs: Record<string, { bytesInOutput: number }> }>;
  };
  const verdicts: Verdict[] = [];
  const top: { input: string; bytes: number }[] = [];
  for (const [out, o] of Object.entries(meta.outputs)) {
    const name = out.split("/").pop()!;
    const budget = BUDGETS.bundle[name];
    if (!budget) continue;
    const gzip = gzipSync(readFileSync(join(ROOT, out))).length;
    verdicts.push(verdict("bundle", page, `${name} (gzip)`, gzip, budget.maxGzip, "bytes"));
    for (const [input, i] of Object.entries(o.inputs)) top.push({ input: input.replace(/^node_modules\//, ""), bytes: i.bytesInOutput });
    verdicts.push(verdict("bundle", page, `${name} (minified, no budget)`, o.bytes, Infinity, "bytes"));
  }
  return { verdicts: verdicts.filter((v) => Number.isFinite(v.max)), raw: verdicts.find((v) => !Number.isFinite(v.max))!.value, top: top.sort((a, b) => b.bytes - a.bytes).slice(0, 4) };
}

export function labBudget(s: LabSummary): Verdict[] {
  const values: Record<string, number> = {
    "largest-contentful-paint": s.lcp,
    "cumulative-layout-shift": s.cls,
    "total-blocking-time": s.tbt,
    "script-transfer-size": s.scriptBytes,
  };
  return Object.entries(BUDGETS.lab).map(([m, l]) => verdict("lab", s.page, m, values[m], l.max, l.unit));
}

export function fieldBudget(page: string, p75s: Record<string, { p75: number }>): Verdict[] {
  return Object.entries(BUDGETS.field).map(([m, l]) => verdict("field", page, `${m} p75`, p75s[m]?.p75 ?? Infinity, l.max, l.unit));
}

export const show = (v: number, unit: string) => (unit === "ms" ? `${Math.round(v)} ms` : unit === "bytes" ? `${(v / 1000).toFixed(1)} kB` : v.toFixed(3));

export function printVerdicts(vs: Verdict[]) {
  for (const v of vs) console.log(`   ${v.pass ? "pass" : "FAIL"}  ${v.scope.padEnd(6)} ${v.page.padEnd(4)}  ${v.metric.padEnd(26)} ${show(v.value, v.unit).padStart(10)}  budget ${show(v.max, v.unit)}`);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// One static page with every verdict, before and after side by side.
export function reportHtml(vs: Verdict[], notes: Record<string, string>): string {
  const keys = [...new Set(vs.map((v) => `${v.scope}|${v.metric}`))];
  const cell = (v?: Verdict) => (v ? `<td class="${v.pass ? "ok" : "bad"}">${esc(show(v.value, v.unit))}<span>${v.pass ? "Pass" : "Over budget"}</span></td>` : "<td></td>");
  const rows = keys
    .map((k) => {
      const [scope, metric] = k.split("|");
      const pick = (page: string) => vs.find((v) => v.scope === scope && v.metric === metric && v.page === page);
      const any = pick("slow") ?? pick("fast")!;
      return `<tr><th>${scope}</th><td>${esc(metric)}</td><td class="num">${esc(show(any.max, any.unit))}</td>${cell(pick("slow"))}${cell(pick("fast"))}</tr>`;
    })
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Performance budgets: slow and fast member page</title><style>
body{font:15px/1.5 system-ui,sans-serif;margin:24px;color:#181c22;background:#fff;max-width:920px}
h1{font-size:22px;margin:0 0 4px}p{margin:0 0 16px;color:#525a66}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #dde1e7}
thead th{font-size:13px;color:#525a66}tbody th{font-weight:600;color:#525a66;font-size:13px;text-transform:uppercase}
td.num,td.ok,td.bad{text-align:right;font-variant-numeric:tabular-nums}
td span{display:block;font-size:12px;font-weight:600}td.ok span{color:#17623a}td.bad span{color:#a32222}td.bad{background:#fdf2f2}
</style></head><body><h1>Performance budgets: the member page, slow and fast</h1>
<p>${esc(notes.lab)}<br>${esc(notes.field)}</p>
<table><thead><tr><th>Scope</th><th>Metric</th><th class="num">Budget</th><th class="num">Slow</th><th class="num">Fast</th></tr></thead><tbody>
${rows}
</tbody></table></body></html>
`;
}
