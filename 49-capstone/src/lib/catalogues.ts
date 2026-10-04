// The catalogue comparison of 25-bilingual (src/catalogues.ts), used by i18n.test.ts: French must have the same keys
// as English and every message the same ICU arguments, with the same types and select cases.
import {
  MessageFormatElement,
  isArgumentElement,
  isDateElement,
  isLiteralElement,
  isNumberElement,
  isPluralElement,
  isPoundElement,
  isSelectElement,
  isTagElement,
  isTimeElement,
  parse,
} from "@formatjs/icu-messageformat-parser";

export type Catalogue = Record<string, string>;

type Args = Map<string, { type: string; options?: string[] }>;

// Every ICU argument a message uses, with its type, and the option keys of each select.
export function argumentsOf(ast: MessageFormatElement[], out: Args = new Map()): Args {
  for (const el of ast) {
    if (isLiteralElement(el) || isPoundElement(el)) continue;
    if (isTagElement(el)) {
      argumentsOf(el.children, out);
      continue;
    }
    const type = isArgumentElement(el) ? "string" : isNumberElement(el) ? "number" : isDateElement(el) ? "date" : isTimeElement(el) ? "time" : isPluralElement(el) ? "plural" : "select";
    out.set(el.value, { type, options: isSelectElement(el) ? Object.keys(el.options).sort() : undefined });
    if (isPluralElement(el) || isSelectElement(el)) for (const o of Object.values(el.options)) argumentsOf(o.value, out);
  }
  return out;
}

// The reference catalogue defines the keys and the arguments; every other catalogue must match it exactly.
export function compareCatalogues(ref: Catalogue, other: Catalogue, name: string): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(ref)) if (!(key in other)) problems.push(`${name}: missing key "${key}"`);
  for (const key of Object.keys(other)) if (!(key in ref)) problems.push(`${name}: unknown key "${key}" (not in the reference)`);
  for (const key of Object.keys(ref).filter((k) => k in other)) {
    let theirs: Args;
    try {
      theirs = argumentsOf(parse(other[key]));
    } catch (err) {
      problems.push(`${name}: "${key}" does not parse: ${(err as Error).message}`);
      continue;
    }
    const mine = argumentsOf(parse(ref[key]));
    for (const [arg, m] of mine) {
      const t = theirs.get(arg);
      if (!t) problems.push(`${name}: "${key}" lacks argument {${arg}}`);
      else if (t.type !== m.type) problems.push(`${name}: "${key}" formats {${arg}} as ${t.type}, the reference as ${m.type}`);
      else if (m.options && t.options?.join() !== m.options.join()) problems.push(`${name}: "${key}" select {${arg}} has cases [${t.options}], the reference [${m.options}]`);
    }
    for (const arg of theirs.keys()) if (!mine.has(arg)) problems.push(`${name}: "${key}" uses argument {${arg}} that the code never passes`);
  }
  return problems;
}
