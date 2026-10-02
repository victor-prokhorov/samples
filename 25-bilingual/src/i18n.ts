import { IntlMessageFormat } from "intl-messageformat";
import { Catalogue, load } from "./catalogues.js";
import { CLOSE, OPEN, pseudoCatalogue } from "./pseudo.js";

export const SUPPORTED = ["en", "fr"];
export const PSEUDO = "en-XA";
export const DEFAULT = "en";
export const NAMES: Record<string, string> = { en: "English", fr: "Français" };

const en = load("messages/en.json");
const CATALOGUES: Record<string, Catalogue> = { en, fr: load("messages/fr.json"), [PSEUDO]: pseudoCatalogue(en) };
const FORMAT_LOCALE: Record<string, string> = { en: "en-GB", fr: "fr-FR", [PSEUDO]: "en-GB" };

export type Values = Record<string, string | number | Date>;

export function translator(locale: string) {
  const catalogue = CATALOGUES[locale];
  const intl = FORMAT_LOCALE[locale];
  const mark = (s: string) => (locale === PSEUDO ? `${OPEN}${s}${CLOSE}` : s);
  return {
    locale,
    t(key: string, values?: Values): string {
      const message = catalogue[key];
      if (message === undefined) throw new Error(`missing message "${key}" in ${locale}`);
      return String(new IntlMessageFormat(message, intl).format(values));
    },
    money: (amount: number) => mark(new Intl.NumberFormat(intl, { style: "currency", currency: "EUR" }).format(amount)),
    date: (d: Date) => mark(new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeZone: "UTC" }).format(d)),
  };
}

export type Translator = ReturnType<typeof translator>;
