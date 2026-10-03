// Tiny diagram model that writes the same drawing twice: an .excalidraw file to edit, and an .svg to read on GitHub.
// Black on white only: no fills, no colours.
import { writeFileSync } from "node:fs";

const INK = "#1e1e1e";
const FONT = 16;
const LABEL = 14; // arrow labels
const LINE = 1.25;
const CHAR = 0.5; // average character width / font size, for Helvetica-like text
const PAD = 5; // left padding of left-aligned box labels (Excalidraw's bound-text padding)
const RADIUS = 8;

let seed = 1;
const nextSeed = () => (seed = (seed * 48271) % 2147483647);

function lines(label) {
  return String(label).split("\n");
}

function textSize(label, size) {
  const ls = lines(label);
  return { w: Math.max(...ls.map((l) => l.length)) * size * CHAR, h: ls.length * size * LINE };
}

export function diagram(name, title) {
  const shapes = [];
  const byId = new Map();
  const d = {
    name,
    // A box with a centred label. opts: { dashed, bold, size, align }
    box(id, x, y, w, h, label, opts = {}) {
      const s = { kind: "box", id, x, y, w, h, label, ...opts };
      shapes.push(s);
      byId.set(id, s);
      return d;
    },
    // A dashed frame with its title in the top-left corner, drawn behind its boxes.
    frame(id, x, y, w, h, label) {
      const s = { kind: "frame", id, x, y, w, h, label };
      shapes.push(s);
      byId.set(id, s);
      return d;
    },
    text(x, y, label, opts = {}) {
      shapes.push({ kind: "text", id: `t${shapes.length}`, x, y, label, ...opts });
      return d;
    },
    // An arrow between two boxes, from border to border.
    // opts: { label, dashed, both, fromSide, toSide, via: [[x, y], ...] corner points for an arrow that goes around things }
    arrow(from, to, opts = {}) {
      shapes.push({ kind: "arrow", id: `a${shapes.length}`, from, to, ...opts });
      return d;
    },
    write(dir) {
      const all = [{ kind: "text", id: "title", x: 40, y: 24, label: title, size: 28, bold: true }, ...shapes];
      for (const s of all) if (s.kind === "arrow") s.pts = route(byId.get(s.from), byId.get(s.to), s);
      check(name, all);
      const bounds = extent(all);
      writeFileSync(`${dir}/${name}.excalidraw`, JSON.stringify(excalidraw(all, byId), null, 2) + "\n");
      writeFileSync(`${dir}/${name}.svg`, svg(all, bounds));
    },
  };
  return d;
}

function anchor(b, side) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  if (side === "top") return [cx, b.y];
  if (side === "bottom") return [cx, b.y + b.h];
  if (side === "left") return [b.x, cy];
  return [b.x + b.w, cy];
}

// Where an arrow leaves a box towards point p (the next corner): straight out of the facing side.
function exitTowards(b, p) {
  if (p[0] >= b.x && p[0] <= b.x + b.w) return [p[0], p[1] < b.y ? b.y : b.y + b.h];
  if (p[1] >= b.y && p[1] <= b.y + b.h) return [p[0] < b.x ? b.x : b.x + b.w, p[1]];
  return anchor(b, Math.abs(p[0] - (b.x + b.w / 2)) / b.w > Math.abs(p[1] - (b.y + b.h / 2)) / b.h ? (p[0] > b.x ? "right" : "left") : p[1] > b.y ? "bottom" : "top");
}

// Returns the arrow's points, border to border.
function route(a, b, s) {
  if (!a || !b) throw new Error(`arrow ${s.from} -> ${s.to}: unknown box`);
  if (s.via) return [exitTowards(a, s.via[0]), ...s.via, exitTowards(b, s.via[s.via.length - 1])];
  const ov = (a0, a1, b0, b1) => (Math.max(a0, b0) < Math.min(a1, b1) ? (Math.max(a0, b0) + Math.min(a1, b1)) / 2 : null);
  const ox = ov(a.x, a.x + a.w, b.x, b.x + b.w);
  const oy = ov(a.y, a.y + a.h, b.y, b.y + b.h);
  const ca = [a.x + a.w / 2, a.y + a.h / 2];
  const cb = [b.x + b.w / 2, b.y + b.h / 2];
  const vert = (side) => side === "top" || side === "bottom";
  let fromSide = s.fromSide;
  let toSide = s.toSide;
  if (!fromSide && !toSide) {
    // Overlapping ranges: a straight line through the middle of the overlap.
    if (oy !== null && (b.x >= a.x + a.w || a.x >= b.x + b.w)) {
      const r = b.x >= a.x + a.w;
      return [
        [r ? a.x + a.w : a.x, oy],
        [r ? b.x : b.x + b.w, oy],
      ];
    }
    if (ox !== null && (b.y >= a.y + a.h || a.y >= b.y + b.h)) {
      const dn = b.y >= a.y + a.h;
      return [
        [ox, dn ? a.y + a.h : a.y],
        [ox, dn ? b.y : b.y + b.h],
      ];
    }
    // Otherwise the centre-to-centre line clipped at both borders (what Excalidraw does with focus 0).
    const clip = (box, c, o) => {
      const dx = o[0] - c[0];
      const dy = o[1] - c[1];
      const t = Math.min(dx ? box.w / 2 / Math.abs(dx) : Infinity, dy ? box.h / 2 / Math.abs(dy) : Infinity);
      return [c[0] + dx * t, c[1] + dy * t];
    };
    return [clip(a, ca, cb), clip(b, cb, ca)];
  }
  if (!fromSide || !toSide) {
    const dx = cb[0] - ca[0];
    const dy = cb[1] - ca[1];
    const horizontal = Math.abs(dx) / (a.w + b.w) > Math.abs(dy) / (a.h + b.h);
    fromSide ??= horizontal ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top";
    toSide ??= horizontal ? (dx > 0 ? "left" : "right") : dy > 0 ? "top" : "bottom";
  }
  let [x1, y1] = anchor(a, fromSide);
  let [x2, y2] = anchor(b, toSide);
  // Facing sides with an overlap: keep the line straight.
  if (vert(fromSide) && vert(toSide) && ox !== null) x1 = x2 = ox;
  if (!vert(fromSide) && !vert(toSide) && oy !== null) y1 = y2 = oy;
  return [
    [x1, y1],
    [x2, y2],
  ];
}

// Excalidraw's binding "focus" (port of determineFocusDistance, rectangles, no rotation): where the line from the
// adjacent point a through the edge point b crosses the box's diagonals, as a signed fraction of the half diagonal.
// With it, Excalidraw keeps an off-centre arrow where it is when a box is moved; with 0 it would snap to the centre.
function focus(el, a, b) {
  if (a[0] === b[0] && a[1] === b[1]) return 0;
  const c = [el.x + el.w / 2, el.y + el.h / 2];
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
  const cross = (u, v) => u[0] * v[1] - v[0] * u[1];
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const sign = -Math.sign(cross(sub(b, a), sub(b, c)));
  const dir = sub(b, a);
  const len = Math.hypot(...dir);
  const far = [b[0] + (dir[0] / len) * Math.max(el.w * 2, el.h * 2), b[1] + (dir[1] / len) * Math.max(el.w * 2, el.h * 2)];
  const diagonals = [
    [
      [el.x - el.w, el.y - el.h],
      [el.x + el.w * 2, el.y + el.h * 2],
    ],
    [
      [el.x + el.w * 2, el.y - el.h],
      [el.x - el.w, el.y + el.h * 2],
    ],
  ];
  const hits = diagonals
    .map(([p, q]) => intersect(b, far, p, q))
    .filter(Boolean)
    .sort((g, h) => dist(g, b) - dist(h, b))
    .map((p) => (sign * dist(c, p)) / (Math.hypot(el.w, el.h) / 2))
    .sort((g, h) => Math.abs(g) - Math.abs(h));
  return Number((hits[0] ?? 0).toFixed(4)) || 0;
}

function intersect(p1, p2, p3, p4) {
  const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / d;
  const u = -((p1[0] - p2[0]) * (p1[1] - p3[1]) - (p1[1] - p2[1]) * (p1[0] - p3[0])) / d;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}

// Where an arrow's label sits: Excalidraw's rule (middle point, or middle of the middle segment).
function labelAt(pts) {
  if (pts.length % 2 === 1) return pts[(pts.length - 1) / 2];
  const i = pts.length / 2 - 1;
  return [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
}

// Build-time layout check: arrows that cross each other or run through a box, and labels longer than their segment.
function check(name, all) {
  const arrows = all.filter((s) => s.kind === "arrow");
  const boxes = all.filter((s) => s.kind === "box");
  const segs = (a) => a.pts.slice(1).map((p, i) => [a.pts[i], p]);
  const warn = (msg) => console.warn(`${name}: ${msg}`);
  for (const a of arrows) {
    for (const [p, q] of segs(a))
      for (const b of boxes) {
        if (b.id === a.from || b.id === a.to) continue;
        const inside = (t) => {
          const x = p[0] + (q[0] - p[0]) * t;
          const y = p[1] + (q[1] - p[1]) * t;
          return x > b.x + 1 && x < b.x + b.w - 1 && y > b.y + 1 && y < b.y + b.h - 1;
        };
        if ([0.1, 0.25, 0.5, 0.75, 0.9].some(inside)) warn(`arrow ${a.from}->${a.to} runs through box ${b.id}`);
      }
    if (a.label) {
      const t = textSize(a.label, LABEL);
      const i = a.pts.length % 2 === 1 ? null : a.pts.length / 2 - 1;
      const seg = i === null ? Infinity : Math.hypot(a.pts[i + 1][0] - a.pts[i][0], a.pts[i + 1][1] - a.pts[i][1]);
      const along = i !== null && Math.abs(a.pts[i + 1][0] - a.pts[i][0]) > Math.abs(a.pts[i + 1][1] - a.pts[i][1]) ? t.w : t.h;
      if (seg - along < 24) warn(`label "${a.label}" on ${a.from}->${a.to} covers most of its arrow`);
    }
  }
  for (let i = 0; i < arrows.length; i++)
    for (let j = i + 1; j < arrows.length; j++)
      for (const [p, q] of segs(arrows[i]))
        for (const [r, s] of segs(arrows[j])) {
          const x = intersect(p, q, r, s);
          const end = (pt) => [p, q, r, s].some((e) => Math.hypot(e[0] - pt[0], e[1] - pt[1]) < 2);
          if (x && !end(x)) warn(`arrows ${arrows[i].from}->${arrows[i].to} and ${arrows[j].from}->${arrows[j].to} cross`);
        }
}

function extent(all) {
  let maxX = 0;
  let maxY = 0;
  for (const s of all) {
    if (s.kind === "arrow") {
      for (const [x, y] of s.pts) {
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    } else if (s.kind === "text") {
      const t = textSize(s.label, s.size ?? FONT);
      maxX = Math.max(maxX, s.x + t.w);
      maxY = Math.max(maxY, s.y + t.h);
    } else {
      maxX = Math.max(maxX, s.x + s.w);
      maxY = Math.max(maxY, s.y + s.h);
    }
  }
  return { w: Math.ceil(maxX + 40), h: Math.ceil(maxY + 40) };
}

function base(id, type, x, y, w, h, extra = {}) {
  return {
    id,
    type,
    x,
    y,
    width: w,
    height: h,
    angle: 0,
    strokeColor: INK,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: nextSeed(),
    version: 1,
    versionNonce: nextSeed(),
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...extra,
  };
}

function textEl(id, label, size, x, y, extra = {}) {
  const t = textSize(label, size);
  return base(id, "text", x, y, t.w, t.h, {
    text: label,
    originalText: label,
    fontSize: size,
    fontFamily: 2,
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    lineHeight: LINE,
    autoResize: true,
    ...extra,
  });
}

function excalidraw(all, byId) {
  const out = [];
  const bound = new Map();
  const bind = (id, ref) => {
    if (!bound.has(id)) bound.set(id, []);
    bound.get(id).push(ref);
  };
  for (const s of all) {
    if (s.kind === "box" || s.kind === "frame") {
      const dashed = s.kind === "frame" || s.dashed;
      // A frame and its title are grouped, so they move together.
      const groupIds = s.kind === "frame" ? [`${s.id}-group`] : [];
      const el = base(s.id, "rectangle", s.x, s.y, s.w, s.h, {
        strokeStyle: dashed ? "dashed" : "solid",
        strokeWidth: s.bold ? 2 : 1,
        roundness: s.kind === "frame" ? null : { type: 3, value: RADIUS },
        groupIds,
      });
      out.push(el);
      const size = s.size ?? (s.kind === "frame" ? 18 : FONT);
      if (s.kind === "frame") {
        out.push(textEl(`${s.id}-label`, s.label, size, s.x + 10, s.y + 8, { groupIds }));
      } else {
        const t = textSize(s.label, size);
        const left = s.align === "left";
        const tx = left ? s.x + PAD : s.x + (s.w - t.w) / 2;
        out.push(
          textEl(`${s.id}-label`, s.label, size, tx, s.y + (s.h - t.h) / 2, {
            containerId: s.id,
            textAlign: left ? "left" : "center",
            verticalAlign: "middle",
          }),
        );
        bind(s.id, { type: "text", id: `${s.id}-label` });
      }
    } else if (s.kind === "text") {
      out.push(textEl(s.id, s.label, s.size ?? FONT, s.x, s.y));
    } else if (s.kind === "arrow") {
      const [x0, y0] = s.pts[0];
      const n = s.pts.length;
      const xs = s.pts.map((p) => p[0]);
      const ys = s.pts.map((p) => p[1]);
      const el = base(s.id, "arrow", x0, y0, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), {
        strokeStyle: s.dashed ? "dashed" : "solid",
        roundness: null,
        points: s.pts.map(([x, y]) => [x - x0, y - y0]),
        lastCommittedPoint: null,
        startBinding: { elementId: s.from, focus: focus(byId.get(s.from), s.pts[1], s.pts[0]), gap: 1 },
        endBinding: { elementId: s.to, focus: focus(byId.get(s.to), s.pts[n - 2], s.pts[n - 1]), gap: 1 },
        startArrowhead: s.both ? "arrow" : null,
        endArrowhead: "arrow",
        elbowed: false,
      });
      out.push(el);
      bind(s.from, { type: "arrow", id: s.id });
      bind(s.to, { type: "arrow", id: s.id });
      if (s.label) {
        const t = textSize(s.label, LABEL);
        const [mx, my] = labelAt(s.pts);
        out.push(
          textEl(`${s.id}-label`, s.label, LABEL, mx - t.w / 2, my - t.h / 2, {
            containerId: s.id,
            textAlign: "center",
            verticalAlign: "middle",
          }),
        );
        bind(s.id, { type: "text", id: `${s.id}-label` });
      }
    }
  }
  for (const el of out) if (bound.has(el.id)) el.boundElements = bound.get(el.id);
  return { type: "excalidraw", version: 2, source: "https://excalidraw.com", elements: out, appState: { viewBackgroundColor: "#ffffff", gridSize: null }, files: {} };
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function svgText(label, size, x, y, anchorMode, bold) {
  const ls = lines(label);
  const weight = bold ? ' font-weight="bold"' : "";
  return ls
    .map((l, i) => `<text x="${x.toFixed(1)}" y="${(y + (i + 0.8) * size * LINE).toFixed(1)}" font-size="${size}" text-anchor="${anchorMode}"${weight}>${esc(l)}</text>`)
    .join("");
}

function svg(all, { w, h }) {
  const parts = [];
  for (const s of all) {
    if (s.kind === "box" || s.kind === "frame") {
      const dashed = s.kind === "frame" || s.dashed ? ' stroke-dasharray="8 6"' : "";
      const rx = s.kind === "frame" ? 0 : RADIUS;
      parts.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${rx}" fill="none" stroke="${INK}" stroke-width="${s.bold ? 2 : 1}"${dashed}/>`);
      const size = s.size ?? (s.kind === "frame" ? 18 : FONT);
      if (s.kind === "frame") parts.push(svgText(s.label, size, s.x + 10, s.y + 8, "start", true));
      else {
        const t = textSize(s.label, size);
        // Box labels are never bold: Excalidraw has no bold text, a bold box is shown by its thicker border.
        if (s.align === "left") parts.push(svgText(s.label, size, s.x + PAD, s.y + (s.h - t.h) / 2, "start", false));
        else parts.push(svgText(s.label, size, s.x + s.w / 2, s.y + (s.h - t.h) / 2, "middle", false));
      }
    } else if (s.kind === "text") {
      parts.push(svgText(s.label, s.size ?? FONT, s.x, s.y, "start", s.bold));
    } else if (s.kind === "arrow") {
      const dashed = s.dashed ? ' stroke-dasharray="6 5"' : "";
      const start = s.both ? ' marker-start="url(#head-start)"' : "";
      const points = s.pts.map(([x, y]) => `${+x.toFixed(1)},${+y.toFixed(1)}`).join(" ");
      parts.push(`<polyline points="${points}" fill="none" stroke="${INK}" stroke-width="1.2"${dashed} marker-end="url(#head)"${start}/>`);
      if (s.label) {
        const t = textSize(s.label, LABEL);
        const [mx, my] = labelAt(s.pts);
        parts.push(`<rect x="${(mx - t.w / 2 - 4).toFixed(1)}" y="${(my - t.h / 2 - 2).toFixed(1)}" width="${(t.w + 8).toFixed(1)}" height="${(t.h + 4).toFixed(1)}" fill="#ffffff"/>`);
        parts.push(svgText(s.label, LABEL, mx, my - t.h / 2, "middle", false));
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Helvetica, Arial, sans-serif" fill="${INK}">` +
    `<defs><marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10" fill="none" stroke="${INK}" stroke-width="1.5"/></marker>` +
    `<marker id="head-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M10,0 L0,5 L10,10" fill="none" stroke="${INK}" stroke-width="1.5"/></marker></defs>` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    parts.join("\n") +
    "</svg>\n"
  );
}
