// out/requests.svg: small multiples, one column per run, one row per measure, a line per tenant. Static SVG, no script.
import { writeFileSync } from "node:fs";

export type Series = Record<string, { accepted: number[]; limited: number[]; p95: number[] }>;
type Panel = { title: string; data: Series };

const C = { surface: "#fcfcfb", ink: "#0b0b0b", muted: "#52514e", grid: "#dddcd7" };
const COLOR: Record<string, string> = { acme: "#2a78d6", globex: "#eb6834", initech: "#1baf7a" };
const NAME: Record<string, string> = { acme: "Acme (noisy)", globex: "Globex", initech: "Initech" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const text = (x: number, y: number, s: string, o: { anchor?: string; size?: number; fill?: string; weight?: number } = {}) =>
  `<text x="${x}" y="${y}" font-size="${o.size ?? 12}" fill="${o.fill ?? C.muted}" text-anchor="${o.anchor ?? "start"}"${o.weight ? ` font-weight="${o.weight}"` : ""}>${esc(s)}</text>`;

function nice(max: number) {
  const step = [1, 2, 2.5, 5, 10].map((m) => m * 10 ** Math.floor(Math.log10(Math.max(1, max) / 4))).find((s) => s * 4 >= max) ?? max / 4;
  return { max: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}

function lines(x: number, y: number, w: number, h: number, values: Record<string, number[]>, scale: { max: number; ticks: number[] }, unit: string) {
  const out: string[] = [];
  for (const t of scale.ticks) {
    const ty = y + h - (t / scale.max) * h;
    out.push(`<line x1="${x}" x2="${x + w}" y1="${ty}" y2="${ty}" stroke="${C.grid}"/>`, text(x - 6, ty + 4, t.toLocaleString("en"), { anchor: "end", size: 11 }));
  }
  const n = Object.values(values)[0].length;
  const px = (i: number) => x + (i / (n - 1)) * w;
  for (const [tenant, v] of Object.entries(values)) {
    // a second with no requests from this tenant has no p95: leave the gap rather than draw a zero
    const pts = v.flatMap((val, i) => (Number.isFinite(val) ? [`${px(i).toFixed(1)},${(y + h - (Math.min(val, scale.max) / scale.max) * h).toFixed(1)}`] : [])).join(" ");
    out.push(`<polyline points="${pts}" fill="none" stroke="${COLOR[tenant]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><title>${esc(`${NAME[tenant]}: ${v.map((x) => (Number.isFinite(x) ? Math.round(x) : "-")).join(", ")} ${unit} per second`)}</title></polyline>`);
  }
  for (let i = 0; i < n; i += 2) out.push(text(px(i), y + h + 15, `${i}s`, { anchor: "middle", size: 11 }));
  return out.join("\n");
}

export function requestsChart(panels: Panel[], file: string) {
  const rows: { key: "accepted" | "limited" | "p95"; title: string; unit: string }[] = [
    { key: "accepted", title: "Accepted (200) per second", unit: "req/s" },
    { key: "limited", title: "Refused (429) per second", unit: "req/s" },
    { key: "p95", title: "p95 latency of accepted requests (ms)", unit: "ms" },
  ];
  const W = 980;
  const pw = 360;
  const ph = 130;
  const col = (i: number) => 110 + i * (pw + 130);
  const rowY = (j: number) => 155 + j * (ph + 70);
  const H = rowY(rows.length) + 10;
  const parts: string[] = [];
  parts.push(text(24, 32, "One noisy tenant, without and with a token bucket per tenant and per API key", { size: 18, fill: C.ink, weight: 600 }));
  parts.push(text(24, 54, "11 s of load: Acme's batch job (48 workers, ignores 429) and sync job (8 workers, honours Retry-After); Globex and Initech portals at 20 req/s each from 1 s", { size: 12 }));
  let lx = 24;
  for (const t of Object.keys(COLOR)) {
    parts.push(`<line x1="${lx}" x2="${lx + 18}" y1="76" y2="76" stroke="${COLOR[t]}" stroke-width="2"/>`, text(lx + 24, 80, NAME[t], { fill: C.ink }));
    lx += 40 + NAME[t].length * 7;
  }
  panels.forEach((p, i) => parts.push(text(col(i), 112, p.title, { size: 14, fill: C.ink, weight: 600 })));
  rows.forEach((r, j) => {
    const all = panels.flatMap((p) => Object.values(p.data).flatMap((d) => d[r.key]));
    const scale = nice(Math.max(...all.filter(Number.isFinite)));
    panels.forEach((p, i) => {
      parts.push(text(col(i), rowY(j) - 14, r.title, { size: 12, fill: C.ink }));
      parts.push(lines(col(i), rowY(j), pw, ph, Object.fromEntries(Object.entries(p.data).map(([t, d]) => [t, d[r.key]])), scale, r.unit));
    });
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">
<rect width="${W}" height="${H}" fill="${C.surface}"/>
${parts.join("\n")}
</svg>
`;
  writeFileSync(file, svg);
  return svg;
}
