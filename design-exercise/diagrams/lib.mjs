// Tiny diagram model that writes the same drawing twice: an .excalidraw file to edit, and an .svg to read on GitHub.
// Black on white only: no fills, no colours.
import { writeFileSync } from "node:fs";

const INK = "#1e1e1e";
const FONT = 16;
const LINE = 1.25;
const CHAR = 0.56;

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
    // An arrow between two boxes, from border to border. opts: { label, dashed, both, from: side, to: side }
    arrow(from, to, opts = {}) {
      shapes.push({ kind: "arrow", id: `a${shapes.length}`, from, to, ...opts });
      return d;
    },
    write(dir) {
      const all = [{ kind: "text", id: "title", x: 40, y: 24, label: title, size: 28, bold: true }, ...shapes];
      for (const s of all) if (s.kind === "arrow") Object.assign(s, route(byId.get(s.from), byId.get(s.to), s));
      const bounds = extent(all);
      writeFileSync(`${dir}/${name}.excalidraw`, JSON.stringify(excalidraw(all), null, 2) + "\n");
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

function route(a, b, s) {
  if (!a || !b) throw new Error(`arrow ${s.from} -> ${s.to}: unknown box`);
  let fromSide = s.fromSide;
  let toSide = s.toSide;
  if (!fromSide || !toSide) {
    const dx = b.x + b.w / 2 - (a.x + a.w / 2);
    const dy = b.y + b.h / 2 - (a.y + a.h / 2);
    const horizontal = Math.abs(dx) / (a.w + b.w) > Math.abs(dy) / (a.h + b.h);
    fromSide ??= horizontal ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top";
    toSide ??= horizontal ? (dx > 0 ? "left" : "right") : dy > 0 ? "top" : "bottom";
  }
  const [x1, y1] = anchor(a, fromSide);
  const [x2, y2] = anchor(b, toSide);
  return { x1, y1, x2, y2 };
}

function extent(all) {
  let maxX = 0;
  let maxY = 0;
  for (const s of all) {
    if (s.kind === "arrow") {
      maxX = Math.max(maxX, s.x1, s.x2);
      maxY = Math.max(maxY, s.y1, s.y2);
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

function excalidraw(all) {
  const out = [];
  const bound = new Map();
  const bind = (id, ref) => {
    if (!bound.has(id)) bound.set(id, []);
    bound.get(id).push(ref);
  };
  for (const s of all) {
    if (s.kind === "box" || s.kind === "frame") {
      const dashed = s.kind === "frame" || s.dashed;
      const el = base(s.id, "rectangle", s.x, s.y, s.w, s.h, {
        strokeStyle: dashed ? "dashed" : "solid",
        strokeWidth: s.bold ? 2 : 1,
        roundness: s.kind === "frame" ? null : { type: 3 },
      });
      out.push(el);
      const size = s.size ?? (s.kind === "frame" ? 18 : FONT);
      if (s.kind === "frame") {
        out.push(textEl(`${s.id}-label`, s.label, size, s.x + 10, s.y + 8));
      } else {
        const t = textSize(s.label, size);
        const left = s.align === "left";
        const tx = left ? s.x + 12 : s.x + (s.w - t.w) / 2;
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
      const el = base(s.id, "arrow", s.x1, s.y1, Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1), {
        strokeStyle: s.dashed ? "dashed" : "solid",
        roundness: { type: 2 },
        points: [
          [0, 0],
          [s.x2 - s.x1, s.y2 - s.y1],
        ],
        lastCommittedPoint: null,
        startBinding: { elementId: s.from, focus: 0, gap: 1 },
        endBinding: { elementId: s.to, focus: 0, gap: 1 },
        startArrowhead: s.both ? "arrow" : null,
        endArrowhead: "arrow",
        elbowed: false,
      });
      out.push(el);
      bind(s.from, { type: "arrow", id: s.id });
      bind(s.to, { type: "arrow", id: s.id });
      if (s.label) {
        const t = textSize(s.label, 14);
        const mx = (s.x1 + s.x2) / 2;
        const my = (s.y1 + s.y2) / 2;
        out.push(
          textEl(`${s.id}-label`, s.label, 14, mx - t.w / 2, my - t.h / 2, {
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
      const rx = s.kind === "frame" ? 0 : 8;
      parts.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${rx}" fill="none" stroke="${INK}" stroke-width="${s.bold ? 2 : 1}"${dashed}/>`);
      const size = s.size ?? (s.kind === "frame" ? 18 : FONT);
      if (s.kind === "frame") parts.push(svgText(s.label, size, s.x + 10, s.y + 8, "start", true));
      else {
        const t = textSize(s.label, size);
        if (s.align === "left") parts.push(svgText(s.label, size, s.x + 12, s.y + (s.h - t.h) / 2, "start", s.bold));
        else parts.push(svgText(s.label, size, s.x + s.w / 2, s.y + (s.h - t.h) / 2, "middle", s.bold));
      }
    } else if (s.kind === "text") {
      parts.push(svgText(s.label, s.size ?? FONT, s.x, s.y, "start", s.bold));
    } else if (s.kind === "arrow") {
      const dashed = s.dashed ? ' stroke-dasharray="6 5"' : "";
      const start = s.both ? ' marker-start="url(#head-start)"' : "";
      parts.push(`<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${INK}" stroke-width="1.2"${dashed} marker-end="url(#head)"${start}/>`);
      if (s.label) {
        const t = textSize(s.label, 14);
        const mx = (s.x1 + s.x2) / 2;
        const my = (s.y1 + s.y2) / 2;
        parts.push(`<rect x="${(mx - t.w / 2 - 4).toFixed(1)}" y="${(my - t.h / 2 - 2).toFixed(1)}" width="${(t.w + 8).toFixed(1)}" height="${(t.h + 4).toFixed(1)}" fill="#ffffff"/>`);
        parts.push(svgText(s.label, 14, mx, my - t.h / 2, "middle", false));
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Helvetica, Arial, sans-serif" fill="${INK}">` +
    `<defs><marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10" fill="none" stroke="${INK}" stroke-width="1.5"/></marker>` +
    `<marker id="head-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M10,0 L0,5 L10,10" fill="none" stroke="${INK}" stroke-width="1.5"/></marker></defs>` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    parts.join("\n") +
    "</svg>\n"
  );
}
