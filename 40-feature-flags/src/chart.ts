// out/exposure.svg: who saw projection-v2 at each rollout step, drawn from the exposures table. Static SVG, no script.
import { writeFileSync } from "node:fs";

export type Step = { pct: number; on: number; kept: number; lost: number; naiveOn: number; naiveLost: number; members: number };

const C = { surface: "#fcfcfb", ink: "#0b0b0b", muted: "#52514e", grid: "#dddcd7", kept: "#2a78d6", added: "#1baf7a", naive: "#eb6834" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const text = (x: number, y: number, s: string, o: { anchor?: string; size?: number; fill?: string; weight?: number } = {}) =>
  `<text x="${x}" y="${y}" font-size="${o.size ?? 12}" fill="${o.fill ?? C.muted}" text-anchor="${o.anchor ?? "start"}"${o.weight ? ` font-weight="${o.weight}"` : ""}>${esc(s)}</text>`;

// a bar whose top corners are rounded (the data end), square at the baseline
function bar(x: number, y: number, w: number, h: number, fill: string, round: boolean, title: string) {
  if (h <= 0) return "";
  const r = round ? Math.min(4, h, w / 2) : 0;
  const d = `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  return `<path d="${d}" fill="${fill}"><title>${esc(title)}</title></path>`;
}

function axis(x: number, y: number, w: number, h: number, max: number, ticks: number[]) {
  return ticks
    .map((t) => {
      const ty = y + h - (t / max) * h;
      return `<line x1="${x}" x2="${x + w}" y1="${ty}" y2="${ty}" stroke="${C.grid}" stroke-width="1"/>` + text(x - 6, ty + 4, t.toLocaleString("en"), { anchor: "end", size: 11 });
    })
    .join("");
}

function legend(x: number, y: number, items: [string, string][]) {
  let cx = x;
  return items
    .map(([label, color]) => {
      const s = `<rect x="${cx}" y="${y - 9}" width="10" height="10" rx="2" fill="${color}"/>` + text(cx + 15, y, label, { fill: C.ink });
      cx += 25 + label.length * 6.6;
      return s;
    })
    .join("");
}

export function exposureChart(steps: Step[], file: string) {
  const W = 940;
  const H = 440;
  const top = 130;
  const h = 230;
  const members = steps[0].members;
  const parts: string[] = [];
  parts.push(text(24, 32, "projection-v2 rollout: who sees the feature at each step", { size: 18, fill: C.ink, weight: 600 }));
  parts.push(text(24, 54, `${members.toLocaleString("en")} members, bucket = sha256(flag key : member id) mod 10000; on when bucket < percentage x 100`, { size: 12 }));

  // left panel: members exposed, split into "already had it at the previous step" and "added at this step"
  const ax = 90;
  const aw = 380;
  parts.push(text(ax - 60, top - 50, "Members exposed (stable hash)", { size: 13, fill: C.ink, weight: 600 }));
  parts.push(legend(ax - 60, top - 28, [["kept from previous step", C.kept], ["added", C.added]]));
  parts.push(axis(ax, top, aw, h, members, [0, 2500, 5000, 7500, 10000]));
  const slot = aw / steps.length;
  const bw = 46;
  steps.forEach((s, i) => {
    const x = ax + i * slot + (slot - bw) / 2;
    const y = (v: number) => top + h - (v / members) * h;
    const keptH = (s.kept / members) * h;
    const addedH = ((s.on - s.kept) / members) * h;
    parts.push(bar(x, y(s.kept), bw, keptH, C.kept, s.on === s.kept, `${s.pct}%: ${s.kept} kept`));
    parts.push(bar(x, y(s.on), bw, Math.max(0, addedH - (keptH > 0 ? 2 : 0)), C.added, true, `${s.pct}%: ${s.on - s.kept} added`));
    const target = (s.pct / 100) * members;
    parts.push(`<line x1="${x - 6}" x2="${x + bw + 6}" y1="${y(target)}" y2="${y(target)}" stroke="${C.ink}" stroke-width="1.5" stroke-dasharray="3 3"/>`);
    parts.push(text(x + bw / 2, y(Math.max(s.on, target)) - 8, `${s.on.toLocaleString("en")} (${((100 * s.on) / members).toFixed(1)}%)`, { anchor: "middle", fill: C.ink }));
    parts.push(text(x + bw / 2, top + h + 18, `${s.pct}%`, { anchor: "middle", fill: C.ink }));
  });
  parts.push(text(ax, top + h + 40, "rollout step (dashed line: the target count)", { size: 11 }));

  // right panel: members who LOST the feature when the percentage went up
  const bx = 580;
  const bwid = 320;
  const later = steps.slice(1);
  const lmax = Math.ceil(Math.max(100, ...later.map((s) => s.naiveLost)) / 200) * 200;
  const lticks = Array.from({ length: lmax / 200 + 1 }, (_, i) => i * 200);
  parts.push(text(bx - 60, top - 50, "Members who lost the feature at this step", { size: 13, fill: C.ink, weight: 600 }));
  parts.push(legend(bx - 60, top - 28, [["stable hash", C.kept], ["fresh Math.random() per request", C.naive]]));
  parts.push(axis(bx, top + 10, bwid, h - 10, lmax, lticks));
  const lslot = bwid / later.length;
  later.forEach((s, i) => {
    const gx = bx + i * lslot + lslot / 2;
    const y = (v: number) => top + 10 + (h - 10) - (v / lmax) * (h - 10);
    const w = 30;
    parts.push(bar(gx - w - 1, y(s.lost), w, (s.lost / lmax) * (h - 10), C.kept, true, `${s.pct}%: stable hash lost ${s.lost}`));
    parts.push(text(gx - w / 2 - 1, y(s.lost) - 6, String(s.lost), { anchor: "middle", fill: C.ink }));
    parts.push(bar(gx + 1, y(s.naiveLost), w, (s.naiveLost / lmax) * (h - 10), C.naive, true, `${s.pct}%: naive lost ${s.naiveLost}`));
    parts.push(text(gx + w / 2 + 1, y(s.naiveLost) - 6, String(s.naiveLost), { anchor: "middle", fill: C.ink }));
    parts.push(text(gx, top + h + 18, `${steps[i].pct}% -> ${s.pct}%`, { anchor: "middle", fill: C.ink }));
  });
  parts.push(text(bx, top + h + 40, "had it at the previous step, not at this one", { size: 11 }));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">
<rect width="${W}" height="${H}" fill="${C.surface}"/>
${parts.join("\n")}
</svg>
`;
  writeFileSync(file, svg);
  return svg;
}
