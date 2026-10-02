export const FIELDS = ["line1", "city", "postcode", "country", "when"] as const;
export type Field = (typeof FIELDS)[number];
export type Values = Record<Field, string>;
export type Errors = Partial<Record<Field, string>>;

export const LABELS: Record<Field, string> = {
  line1: "Address line 1",
  city: "Town or city",
  postcode: "Postcode",
  country: "Country",
  when: "When should the change apply?",
};

const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i;

export function parse(body: string): Values {
  const p = new URLSearchParams(body);
  return Object.fromEntries(FIELDS.map((f) => [f, (p.get(f) ?? "").trim()])) as Values;
}

export function validate(v: Values): Errors {
  const e: Errors = {};
  if (!v.line1) e.line1 = "Enter the first line of your address";
  if (!v.city) e.city = "Enter your town or city";
  if (!v.postcode) e.postcode = "Enter your postcode";
  else if (!POSTCODE.test(v.postcode)) e.postcode = "Enter a real postcode, like AB1 2CD";
  if (!v.country) e.country = "Enter your country";
  if (v.when !== "today" && v.when !== "next-statement") e.when = "Select when the change should apply";
  return e;
}

export const empty: Values = { line1: "", city: "", postcode: "", country: "", when: "" };
