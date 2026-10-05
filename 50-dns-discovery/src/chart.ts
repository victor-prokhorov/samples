// out/requests.svg: one bar per client per step, split by the replica that answered; failed requests hatched.
// Static SVG, greys only, so it reads the same printed or on a screen.
import { writeFileSync } from "node:fs";

export type Row = { step: string; client: string; byReplica: Record<string, number>; failed: number };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const SHADES = ["#f7f7f7", "#dedede", "#c2c2c2", "#a3a3a3", "#858585", "#666666", "#474747", "#262626"];

export function requestsChart(rows: Row[], replicas: string[], file: string) {
  const W = 1100, left = 300, barW = 720, rowH = 30, top = 90;
  const shade = (r: string) => SHADES[replicas.indexOf(r) % SHADES.length];
  const ink = (r: string) => (replicas.indexOf(r) % SHADES.length >= 5 ? "#fff" : "#111");
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${top + rows.length * rowH + 80}" font-family="Helvetica, Arial, sans-serif">`);
  out.push(`<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff"/><line x1="0" y1="0" x2="0" y2="6" stroke="#111" stroke-width="2"/></pattern></defs>`);
  out.push(`<rect width="100%" height="100%" fill="#fff"/>`);
  out.push(`<text x="20" y="34" font-size="20" font-weight="700" fill="#111">Which replica answered: four clients that only know "catalog:8080"</text>`);
  // legend
  let lx = 20;
  for (const r of [...replicas, "failed"]) {
    out.push(`<rect x="${lx}" y="52" width="16" height="16" fill="${r === "failed" ? "url(#hatch)" : shade(r)}" stroke="#111"/>`);
    out.push(`<text x="${lx + 22}" y="65" font-size="13" fill="#111">${esc(r)}</text>`);
    lx += 34 + r.length * 7;
  }
  let lastStep = "";
  rows.forEach((row, i) => {
    const y = top + i * rowH;
    if (row.step !== lastStep) {
      out.push(`<line x1="20" x2="${W - 20}" y1="${y - 3}" y2="${y - 3}" stroke="#bbb"/>`);
      out.push(`<text x="20" y="${y + 17}" font-size="13" font-weight="700" fill="#111">${esc(row.step)}</text>`);
      lastStep = row.step;
    }
    out.push(`<g class="bar">`);
    out.push(`<text x="${left - 10}" y="${y + 17}" font-size="13" fill="#111" text-anchor="end">${esc(row.client)}</text>`);
    const total = Object.values(row.byReplica).reduce((a, b) => a + b, 0) + row.failed;
    let x = left;
    const segs: [string, number][] = [...replicas.filter((r) => row.byReplica[r]).map((r) => [r, row.byReplica[r]] as [string, number]), ["failed", row.failed]];
    for (const [r, n] of segs) {
      if (!n) continue;
      const w = (n / total) * barW;
      out.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${rowH - 8}" fill="${r === "failed" ? "url(#hatch)" : shade(r)}" stroke="#111" stroke-width="0.75"><title>${esc(`${row.client}: ${r} ${n}`)}</title></rect>`);
      const t = w > 110 ? `${r} ${n}` : String(n);
      const cx = x + w / 2;
      if (r === "failed" && w > 26) out.push(`<rect x="${(cx - t.length * 4 - 4).toFixed(1)}" y="${y + 3}" width="${t.length * 8 + 8}" height="16" fill="#fff"/>`);
      if (w > 26) out.push(`<text x="${cx.toFixed(1)}" y="${y + 16}" font-size="12" text-anchor="middle" fill="${r === "failed" ? "#111" : ink(r)}"${r === "failed" ? ' font-weight="700"' : ""}>${esc(t)}</text>`);
      x += w;
    }
    out.push(`</g>`);
  });
  out.push(`<text x="20" y="${top + rows.length * rowH + 30}" font-size="12" fill="#444">Each bar is one client's run of sequential requests; numbers are requests answered by each replica. Hatched: timed out or refused.</text>`);
  out.push(`</svg>`);
  const svg = out.join("\n") + "\n";
  writeFileSync(file, svg);
  return svg;
}
