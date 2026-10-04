// A small reader for the W3C Design Tokens Community Group format (DTCG, "Design Tokens Format Module 2025.10"),
// the JSON a design tool such as Figma exports for its variables. It covers what this sample uses:
//   - groups (any object without $value), $type inherited from the nearest group, $description;
//   - types color (srgb object or #hex), dimension ({value, unit} in px or rem), fontFamily, fontWeight, number, duration;
//   - aliases "{group.token}", followed to the end of the chain, with cycle and dangling-reference errors.
// Style Dictionary does the same job with more output formats; this file keeps the mechanics in view.
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TOKENS = join(ROOT, "tokens");

const TYPES = ["color", "dimension", "fontFamily", "fontWeight", "number", "duration"] as const;
export type TokenType = (typeof TYPES)[number];

export interface Token {
  name: string; // dotted path, e.g. color.text.muted
  type: TokenType;
  raw: unknown; // the $value as written: a literal or an alias string
  description?: string;
  file: string; // the file that set the value last
}

export type Tokens = Map<string, Token>;

const ALIAS = /^\{([^{}]+)\}$/;

export const isAlias = (raw: unknown): raw is string => typeof raw === "string" && ALIAS.test(raw);

function walk(node: Record<string, unknown>, path: string[], inherited: TokenType | undefined, file: string, into: Tokens) {
  const type = (node.$type as TokenType | undefined) ?? inherited;
  if (type && !TYPES.includes(type)) throw new Error(`${file}: ${path.join(".")}: unsupported $type ${type}`);
  if ("$value" in node) {
    const name = path.join(".");
    const prev = into.get(name);
    const t = type ?? prev?.type;
    if (!t) throw new Error(`${file}: ${name}: no $type on the token or any parent group`);
    into.set(name, { name, type: t, raw: node.$value, description: (node.$description as string | undefined) ?? prev?.description, file });
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    if (/[{}.]/.test(key)) throw new Error(`${file}: ${[...path, key].join(".")}: names cannot contain { } or .`);
    if (child && typeof child === "object" && !Array.isArray(child)) walk(child as Record<string, unknown>, [...path, key], type, file, into);
  }
}

// Later files override earlier ones, token by token: primitives, then the semantic layer, then a theme, then proposals.
export function load(files: string[]): Tokens {
  const tokens: Tokens = new Map();
  for (const file of files) walk(JSON.parse(readFileSync(file, "utf8")), [], undefined, basename(file), tokens);
  return tokens;
}

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

// primitives + semantic + theme.<theme>, then any proposal whose file name says it is for this theme (x.light.tokens.json).
export function loadTheme(theme: Theme, proposals: string[] = []): Tokens {
  const base = ["primitives", "semantic", `theme.${theme}`].map((f) => join(TOKENS, `${f}.tokens.json`));
  return load([...base, ...proposals.filter((p) => basename(p).includes(`.${theme}.`))]);
}

// Follows an alias chain to a literal. Returns the literal and the names it went through.
export function resolve(tokens: Tokens, name: string): { value: unknown; chain: string[] } {
  const chain: string[] = [];
  let current = name;
  for (;;) {
    if (chain.includes(current)) throw new Error(`alias cycle: ${[...chain, current].join(" -> ")}`);
    const t = tokens.get(current);
    if (!t) throw new Error(chain.length ? `${chain.at(-1)} points to ${current}, which does not exist` : `unknown token ${current}`);
    chain.push(current);
    if (!isAlias(t.raw)) return { value: t.raw, chain };
    current = ALIAS.exec(t.raw)![1];
  }
}

export const cssVar = (name: string) => `--${name.replace(/\./g, "-")}`;

interface DtcgColor {
  colorSpace: string;
  components: number[];
  alpha?: number;
  hex?: string;
}

function colorToCss(v: unknown, name: string): string {
  if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  const c = v as DtcgColor;
  if (c?.colorSpace !== "srgb" || c.components?.length !== 3) throw new Error(`${name}: only srgb colours are supported here`);
  const hex = "#" + c.components.map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
  if (c.hex && c.hex.toLowerCase() !== hex) throw new Error(`${name}: hex ${c.hex} does not match components (${hex})`);
  return (c.alpha ?? 1) === 1 ? hex : `rgb(${c.components.map((x) => Math.round(x * 255)).join(" ")} / ${c.alpha})`;
}

// A literal $value as CSS.
export function literalToCss(type: TokenType, v: unknown, name: string): string {
  switch (type) {
    case "color":
      return colorToCss(v, name);
    case "dimension":
    case "duration": {
      const d = v as { value: number; unit: string };
      const units = type === "dimension" ? ["px", "rem"] : ["ms", "s"];
      if (typeof d?.value !== "number" || !units.includes(d.unit)) throw new Error(`${name}: ${type} must be {value, unit} with unit ${units.join(" or ")}`);
      return d.value === 0 ? "0" : `${d.value}${d.unit}`;
    }
    case "fontFamily":
      return (Array.isArray(v) ? v : [v]).map((f) => (/^[\w-]+$/.test(f) ? f : `"${f}"`)).join(", ");
    case "fontWeight":
    case "number":
      if (typeof v !== "number") throw new Error(`${name}: ${type} must be a number`);
      return String(v);
  }
}

// The token as CSS: an alias stays a reference (var(--other)), so the custom properties keep the primitive -> semantic link.
export function tokenToCss(tokens: Tokens, t: Token): string {
  if (isAlias(t.raw)) {
    const target = resolve(tokens, t.name).chain[1];
    const to = tokens.get(target)!;
    if (to.type !== t.type) throw new Error(`${t.name} (${t.type}) points to ${target} (${to.type})`);
    return `var(${cssVar(target)})`;
  }
  return literalToCss(t.type, t.raw, t.name);
}

// The final colour of a token, following aliases: what the contrast check measures.
export function hexOf(tokens: Tokens, name: string): string {
  const t = tokens.get(name);
  if (!t) throw new Error(`unknown token ${name}`);
  if (t.type !== "color") throw new Error(`${name} is not a color`);
  return colorToCss(resolve(tokens, name).value, name);
}
