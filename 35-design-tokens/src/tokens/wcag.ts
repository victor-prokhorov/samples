// WCAG 2.x contrast ratio, as defined in the spec ("relative luminance" and "contrast ratio" in the glossary).
// Works on opaque sRGB colours given as #rrggbb.

export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not an opaque #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// sRGB channel (0..255) to linear light (0..1). WCAG 2.x quotes 0.03928 as the threshold; the sRGB standard says
// 0.04045. No 8-bit value lies between the two, so both give the same result.
function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// (L1 + 0.05) / (L2 + 0.05), lighter over darker: 1 (same colour) to 21 (black on white).
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// WCAG 2.2 AA minimums: 1.4.3 text 4.5:1, large text (24px, or 18.66px bold) 3:1; 1.4.11 UI component boundaries,
// focus indicators and meaningful graphics 3:1.
export const MINIMUM = { text: 4.5, "large-text": 3, ui: 3 } as const;
export type Usage = keyof typeof MINIMUM;

// The ratio is truncated, not rounded, before the comparison: 4.499 fails 4.5 (the spec says "at least").
export const format = (ratio: number) => `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
