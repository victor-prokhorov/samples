// out/throughput-latency.svg: what the ramp found. Left: throughput served against throughput offered. Right: latency
// against throughput served, the curve that bends where the API saturates. Static SVG, no script.
import { writeFileSync } from "node:fs";

export type Point = { offered: number; achieved: number; p50: number; p95: number; avg: number; dropped: number };

const C = { surface: "#fcfcfb", ink: "#0b0b0b", muted: "#52514e", grid: "#dddcd7", p50: "#2a78d6", p95: "#eb6834", served: "#2a78d6" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const text = (x: number, y: number, s: string, o: { anchor?: string; size?: number; fill?: string; weight?: number } = {}) =>
  `<text x="${x}" y="${y}" font-size="${o.size ?? 12}" fill="${o.fill ?? C.muted}" text-anchor="${o.anchor ?? "start"}"${o.weight ? ` font-weight="${o.weight}"` : ""}>${esc(s)}</text>`;

function niceMax(v: number) {
  const step = [1, 2, 2.5, 5, 10].map((m) => m * 10 ** Math.floor(Math.log10(Math.max(1, v) / 4))).find((s) => s * 4 >= v)!;
  return { max: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}

type Frame = { x: number; y: number; w: number; h: number; xmax: number; ymax: number };
const sx = (f: Frame, v: number) => f.x + (v / f.xmax) * f.w;
const sy = (f: Frame, v: number) => f.y + f.h - (Math.min(v, f.ymax) / f.ymax) * f.h;

function axes(f: Frame, xt: number[], yt: number[], xlabel: string, ylabel: string) {
  const out: string[] = [];
  for (const t of yt) out.push(`<line x1="${f.x}" x2="${f.x + f.w}" y1="${sy(f, t)}" y2="${sy(f, t)}" stroke="${C.grid}"/>`, text(f.x - 6, sy(f, t) + 4, String(t), { anchor: "end", size: 11 }));
  for (const t of xt) out.push(text(sx(f, t), f.y + f.h + 16, String(t), { anchor: "middle", size: 11 }));
  out.push(text(f.x + f.w / 2, f.y + f.h + 36, xlabel, { anchor: "middle", size: 12 }), text(f.x - 50, f.y - 10, ylabel, { size: 12 }));
  return out.join("\n");
}

function series(f: Frame, pts: [number, number][], color: string, label: string) {
  const line = `<polyline points="${pts.map(([x, y]) => `${sx(f, x).toFixed(1)},${sy(f, y).toFixed(1)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
  const dots = pts.map(([x, y]) => `<circle cx="${sx(f, x).toFixed(1)}" cy="${sy(f, y).toFixed(1)}" r="4" fill="${color}" stroke="${C.surface}" stroke-width="2"><title>${esc(`${label}: ${Math.round(x)} req/s, ${Math.round(y)}`)}</title></circle>`);
  return [line, ...dots].join("\n");
}

export function curveChart(points: Point[], capacity: number, slo: number, file: string) {
  const W = 980;
  const H = 510;
  const parts: string[] = [];
  parts.push(text(24, 32, "Ramp: GET /members/:id/statement, one step every 4 s", { size: 18, fill: C.ink, weight: 600 }));
  parts.push(text(24, 54, `Little's law: 4 connections / 40 ms per statement = ${capacity} req/s at most. Past that, requests queue and latency climbs while throughput stays flat.`, { size: 12 }));

  const offeredMax = Math.max(...points.map((p) => p.offered));
  const xs = niceMax(offeredMax);
  // left: served vs offered
  const L: Frame = { x: 80, y: 130, w: 360, h: 260, xmax: xs.max, ymax: xs.max };
  parts.push(text(L.x - 50, 96, "Throughput served vs offered", { size: 14, fill: C.ink, weight: 600 }));
  parts.push(axes(L, xs.ticks, xs.ticks, "offered (req/s)", "served (req/s)"));
  parts.push(`<line x1="${sx(L, 0)}" y1="${sy(L, 0)}" x2="${sx(L, xs.max)}" y2="${sy(L, xs.max)}" stroke="${C.muted}" stroke-dasharray="4 4"/>`, text(sx(L, xs.max) - 4, sy(L, xs.max) + 16, "served = offered", { anchor: "end", size: 11 }));
  parts.push(`<line x1="${L.x}" x2="${L.x + L.w}" y1="${sy(L, capacity)}" y2="${sy(L, capacity)}" stroke="${C.ink}" stroke-dasharray="2 4"/>`, text(L.x + 6, sy(L, capacity) - 6, `capacity by Little's law: ${capacity}/s`, { size: 11, fill: C.ink }));
  parts.push(series(L, points.map((p) => [p.offered, p.achieved]), C.served, "served"));

  // right: latency vs served throughput
  const latMax = niceMax(Math.max(...points.map((p) => p.p95)));
  const rx = Array.from({ length: 6 }, (_, i) => (i * capacity) / 4); // 0 .. 1.25 x capacity
  const R: Frame = { x: 580, y: 130, w: 360, h: 260, xmax: rx[5], ymax: latMax.max };
  parts.push(text(R.x - 50, 96, "Latency vs throughput served", { size: 14, fill: C.ink, weight: 600 }));
  parts.push(axes(R, rx, latMax.ticks, "served (req/s)", "latency (ms)"));
  parts.push(`<line x1="${sx(R, capacity)}" x2="${sx(R, capacity)}" y1="${R.y}" y2="${R.y + R.h}" stroke="${C.ink}" stroke-dasharray="2 4"/>`);
  if (slo < latMax.max) parts.push(`<line x1="${R.x}" x2="${R.x + R.w}" y1="${sy(R, slo)}" y2="${sy(R, slo)}" stroke="${C.muted}" stroke-dasharray="4 4"/>`, text(R.x + 6, sy(R, slo) - 6, `SLO: p95 < ${slo} ms`, { size: 11 }));
  parts.push(series(R, points.map((p) => [p.achieved, p.p50]), C.p50, "p50"));
  parts.push(series(R, points.map((p) => [p.achieved, p.p95]), C.p95, "p95"));
  const last = points[points.length - 1];
  parts.push(text(sx(R, last.achieved) - 10, sy(R, last.p95) + 4, "p95", { anchor: "end", fill: C.ink }), text(sx(R, last.achieved) - 10, sy(R, last.p50) + 4, "p50", { anchor: "end", fill: C.ink }));
  // legend
  parts.push(`<circle cx="${R.x - 40}" cy="${H - 34}" r="4" fill="${C.p50}"/>`, text(R.x - 30, H - 30, "p50 (median)", { fill: C.ink }));
  parts.push(`<circle cx="${R.x + 70}" cy="${H - 34}" r="4" fill="${C.p95}"/>`, text(R.x + 80, H - 30, "p95", { fill: C.ink }));
  parts.push(text(24, H - 10, `steps offered: ${points.map((p) => p.offered).join(", ")} req/s; dropped by k6 when 60 requests were already waiting: ${points.map((p) => p.dropped).join(", ")}`, { size: 11 }));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">
<rect width="${W}" height="${H}" fill="${C.surface}"/>
${parts.join("\n")}
</svg>
`;
  writeFileSync(file, svg);
  return svg;
}
