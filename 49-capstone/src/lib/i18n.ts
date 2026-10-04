// The translator of 25-bilingual: ICU messages (intl-messageformat) from one catalogue per language, and Intl for
// numbers, money and dates. Pages never build a sentence out of pieces; they ask for a message with its values.
import { IntlMessageFormat } from "intl-messageformat";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

export const SUPPORTED = ["en", "fr"] as const;
export type Locale = (typeof SUPPORTED)[number];
export const DEFAULT: Locale = "en";
export const NAMES: Record<Locale, string> = { en: "English", fr: "Français" };
export const CATALOGUES: Record<Locale, Record<string, string>> = { en, fr };
const FORMAT_LOCALE: Record<Locale, string> = { en: "en-GB", fr: "fr-FR" };

export const isLocale = (s: string | undefined): s is Locale => (SUPPORTED as readonly string[]).includes(s ?? "");

export type Values = Record<string, string | number | Date>;

export function translator(locale: Locale) {
  const catalogue = CATALOGUES[locale];
  const intl = FORMAT_LOCALE[locale];
  return {
    locale,
    t(key: string, values?: Values): string {
      const message = catalogue[key];
      if (message === undefined) throw new Error(`missing message "${key}" in ${locale}`);
      return String(new IntlMessageFormat(message, intl).format(values));
    },
    money: (amount: number) => new Intl.NumberFormat(intl, { style: "currency", currency: "EUR" }).format(amount),
    percent: (value: number) => new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 1 }).format(value / 100),
    month: (d: Date) => new Intl.DateTimeFormat(intl, { month: "long", year: "numeric", timeZone: "UTC" }).format(d),
    date: (d: Date) => new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeZone: "UTC" }).format(d),
    dateTime: (d: Date) => new Intl.DateTimeFormat(intl, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d),
  };
}

export type Translator = ReturnType<typeof translator>;
