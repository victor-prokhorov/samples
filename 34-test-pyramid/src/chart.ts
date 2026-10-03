// out/pyramid.svg from the measured levels: tests per level as a centred pyramid (left), wall time per level as
// bars from a common baseline (right). Same rows, two panels, one scale each: no dual axis.
export interface Level {
  level: string;
  label: string;
  tests: number;
  passed: number;
  wallMs: number; // the whole process: start-up, environment, tests
  testMs: number; // the sum of the tests' own durations
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

// A bar with 4px rounded ends (a centred bar has no baseline, so both ends are rounded).
function bar(x: number, y: number, w: number, h: number, title: string) {
  const r = Math.min(4, w / 2);
  return `<rect class="mark" x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${h}" rx="${r.toFixed(1)}"><title>${esc(title)}</title></rect>`;
}

export function pyramidSvg(levels: Level[]): string {
  const top = [...levels].reverse(); // e2e first
  const W = 900;
  const rowH = 46;
  const barH = 26;
  const y0 = 104;
  const H = y0 + rowH * top.length + 40;
  const nameX = 24;
  const pyrC = 330; // centre of the pyramid panel
  const pyrHalf = 150;
  const timeX = 560;
  const timeMax = 190;
  const maxTests = Math.max(...top.map((l) => l.tests));
  const maxWall = Math.max(...top.map((l) => l.wallMs));
  const rows = top
    .map((l, i) => {
      const y = y0 + i * rowH;
      const cy = y + barH / 2 + 5;
      const w = Math.max(4, (2 * pyrHalf * l.tests) / maxTests);
      const tw = Math.max(4, (timeMax * l.wallMs) / maxWall);
      const per = l.testMs / l.tests;
      return [
        `<text class="name" x="${nameX}" y="${cy}">${esc(l.label)}</text>`,
        bar(pyrC - w / 2, y, w, barH, `${l.label}: ${l.tests} tests`),
        `<text class="value" x="${pyrC + w / 2 + 8}" y="${cy}">${l.tests}</text>`,
        bar(timeX, y, tw, barH, `${l.label}: ${secs(l.wallMs)} wall time, ${per.toFixed(0)} ms per test`),
        `<text class="value" x="${timeX + tw + 8}" y="${cy}">${secs(l.wallMs)}</text>`,
        `<text class="muted" x="${timeX + tw + 8}" y="${cy + 15}">${per < 10 ? per.toFixed(1) : per.toFixed(0)} ms per test</text>`,
      ].join("\n  ");
    })
    .join("\n  ");
  const base = y0 + rowH * top.length - (rowH - barH) / 2 + 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">Test pyramid: tests and wall time per level</title>
<desc id="d">${top.map((l) => `${l.label}: ${l.tests} tests, ${secs(l.wallMs)}`).join("; ")}</desc>
<style>
  .viz { --surface-1: #fcfcfb; --text-primary: #0b0b0b; --text-secondary: #52514e; --rule: #d6d5d0; --series-1: #2a78d6; }
  @media (prefers-color-scheme: dark) { .viz { --surface-1: #1a1a19; --text-primary: #ffffff; --text-secondary: #c3c2b7; --rule: #3a3936; --series-1: #3987e5; } }
  text { font-family: system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; fill: var(--text-primary); }
  .title { font-size: 18px; font-weight: 600; }
  .sub, .muted { font-size: 12px; fill: var(--text-secondary); }
  .head { font-size: 13px; font-weight: 600; fill: var(--text-secondary); }
  .name { font-size: 14px; }
  .value { font-size: 13px; font-variant-numeric: tabular-nums; }
  .mark { fill: var(--series-1); }
  .rule { stroke: var(--rule); stroke-width: 1; }
</style>
<g class="viz">
  <rect width="${W}" height="${H}" fill="var(--surface-1)"/>
  <text class="title" x="${nameX}" y="34">The pyramid, measured: many fast tests at the bottom, one slow one at the top</text>
  <text class="sub" x="${nameX}" y="56">Each level run on its own; wall time is the whole process (start-up, environment, browser), as CI pays it.</text>
  <text class="head" x="${pyrC}" y="${y0 - 14}" text-anchor="middle">Tests per level</text>
  <text class="head" x="${timeX}" y="${y0 - 14}">Wall time per level</text>
  <line class="rule" x1="${timeX}" x2="${timeX}" y1="${y0 - 4}" y2="${base}"/>
  ${rows}
</g>
</svg>
`;
}
