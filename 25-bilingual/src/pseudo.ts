import { MessageFormatElement, TYPE, isLiteralElement, isPluralElement, isSelectElement, isTagElement, parse } from "@formatjs/icu-messageformat-parser";
import { printAST } from "@formatjs/icu-messageformat-parser/printer.js";
import { Catalogue } from "./catalogues.js";

const ACCENTED: Record<string, string> = Object.fromEntries(
  [..."abcdeghiklnorstuwyzACDEGHILNORSTUYZ"].map((c, i) => [c, [..."áƀçðéğĥíķļñóŕšţúŵýžÁÇÐÉĞĤÍĻÑÓŔŠŢÚÝŽ"][i]]),
);

export const OPEN = "⟦";
export const CLOSE = "⟧";

function accent(ast: MessageFormatElement[]): number {
  let letters = 0;
  for (const el of ast) {
    if (isLiteralElement(el)) {
      el.value = [...el.value].map((c) => ACCENTED[c] ?? c).join("");
      letters += el.value.length;
    } else if (isPluralElement(el) || isSelectElement(el)) {
      letters += Math.max(...Object.values(el.options).map((o) => accent(o.value)));
    } else if (isTagElement(el)) {
      letters += accent(el.children);
    }
  }
  return letters;
}

// Accented, 40% longer and bracketed, with every ICU argument kept: readable, but a string that skipped the catalogue stands out.
export function pseudoMessage(message: string): string {
  const ast = parse(message);
  const length = accent(ast);
  const padding = "·".repeat(Math.ceil(length * 0.4));
  return printAST([{ type: TYPE.literal, value: OPEN }, ...ast, { type: TYPE.literal, value: padding + CLOSE }]);
}

export const pseudoCatalogue = (en: Catalogue): Catalogue => Object.fromEntries(Object.entries(en).map(([k, v]) => [k, pseudoMessage(v)]));
