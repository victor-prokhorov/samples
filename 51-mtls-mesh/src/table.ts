// out/results.svg: callers down the side, modes across the top; a tick or a cross and why. Greys only, static SVG.
import { writeFileSync } from "node:fs";

export type Cell = { ok: boolean; text: string };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function resultsTable(modes: string[], callers: { id: string; label: string }[], matrix: Record<string, Record<string, Cell>>, wire: Record<string, Cell>, file: string) {
  const left = 260, colW = 210, rowH = 44, top = 110;
  const W = left + modes.length * colW + 20;
  const rows = [...callers.map((c) => ({ label: c.label, get: (m: string) => matrix[m]?.[c.id] })), { label: "the wire, read by a tap", get: (m: string) => wire[m] }];
  const H = top + rows.length * rowH + 70;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">`);
  out.push(`<rect width="100%" height="100%" fill="#fff"/>`);
  out.push(`<text x="20" y="36" font-size="20" font-weight="700" fill="#111">orders -> payments over gRPC: who gets through, and what the wire shows</text>`);
  modes.forEach((m, i) => out.push(`<text x="${left + i * colW + colW / 2}" y="${top - 16}" font-size="15" font-weight="700" text-anchor="middle" fill="#111">${esc(m)}</text>`));
  out.push(`<text x="20" y="${top - 16}" font-size="13" fill="#444">caller</text>`);
  rows.forEach((r, j) => {
    const y = top + j * rowH;
    const isWire = j === rows.length - 1;
    out.push(`<line x1="20" x2="${W - 20}" y1="${y}" y2="${y}" stroke="${isWire ? "#111" : "#ccc"}"/>`);
    out.push(`<text x="20" y="${y + 27}" font-size="14" fill="#111"${isWire ? ' font-style="italic"' : ""}>${esc(r.label)}</text>`);
    modes.forEach((m, i) => {
      const c = r.get(m);
      if (!c) return;
      const x = left + i * colW + 8;
      // allowed is good for orders and bad for everyone else; the fill only marks "got through", the reader judges
      out.push(`<rect x="${x}" y="${y + 7}" width="${colW - 16}" height="${rowH - 14}" rx="4" fill="${c.ok ? "#e6e6e6" : "#fff"}" stroke="#111" stroke-width="${c.ok ? 0.75 : 1.5}"${c.ok ? "" : ' stroke-dasharray="4 3"'}/>`);
      out.push(`<text x="${x + (colW - 16) / 2}" y="${y + 27}" font-size="13" text-anchor="middle" fill="#111">${esc(`${c.ok ? (isWire ? "" : "✓ ") : "✗ "}${c.text}`)}</text>`);
    });
  });
  out.push(`<line x1="20" x2="${W - 20}" y1="${top + rows.length * rowH}" y2="${top + rows.length * rowH}" stroke="#ccc"/>`);
  out.push(`<text x="20" y="${H - 30}" font-size="12" fill="#444">Grey: the call went through, or the wire was encrypted. Dashed: refused, or readable. Only orders should get through, and only as orders; everyone else should be refused.</text>`);
  out.push(`</svg>`);
  const svg = out.join("\n") + "\n";
  writeFileSync(file, svg);
  return svg;
}
