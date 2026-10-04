// Bank details: pure validation, unit tested in bank.test.ts. Errors are message keys; the page translates them.

export type BankFields = { holder: string; iban: string };
export type BankErrors = Partial<Record<keyof BankFields, string>>;

// Upper case, no spaces: the form the database keeps.
export const normaliseIban = (s: string) => s.replace(/\s+/g, "").toUpperCase();

// Printed in groups of four, the way a bank statement shows it.
export const formatIban = (iban: string) => normaliseIban(iban).replace(/(.{4})(?=.)/g, "$1 ");

// Only the last four characters, for pages that need to say which account without showing it.
export const maskIban = (iban: string) => {
  const n = normaliseIban(iban);
  return `${n.slice(0, 4)} •••• ${n.slice(-4)}`;
};

// ISO 13616 check: move the first four characters to the end, letters to numbers (A=10 .. Z=35), the result mod 97 must be 1.
export function ibanMod97(iban: string): number {
  const n = normaliseIban(iban);
  const digits = (n.slice(4) + n.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest;
}

// The two check digits for a country code and a BBAN, so seed data is valid by construction.
export function withCheckDigits(country: string, bban: string): string {
  const check = 98 - ibanMod97(`${country}00${bban}`);
  return `${country}${String(check).padStart(2, "0")}${bban}`;
}

const SHAPE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

export function validateBank(v: BankFields): BankErrors {
  const e: BankErrors = {};
  if (!v.holder.trim()) e.holder = "errors.holder.required";
  else if (v.holder.trim().length > 70) e.holder = "errors.holder.long";
  const iban = normaliseIban(v.iban);
  if (!iban) e.iban = "errors.iban.required";
  else if (!SHAPE.test(iban)) e.iban = "errors.iban.format";
  else if (ibanMod97(iban) !== 1) e.iban = "errors.iban.checksum";
  return e;
}
