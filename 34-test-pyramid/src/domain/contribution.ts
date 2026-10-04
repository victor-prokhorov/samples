// The rules of a contribution change, as pure functions: the browser form, the API and the tests all call these.
export const RATE_MIN = 2;
export const RATE_MAX = 15;
export const RATE_STEP = 0.5;
export const EMPLOYER_MATCH_CAP = 5; // the employer matches the member's rate up to 5% of salary
export const MAX_MONTHS_AHEAD = 6;

export interface ChangeInput {
  rate: string; // as typed: "6", "6.5", "6,5"
  effectiveFrom: string; // YYYY-MM-DD
}

export interface Change {
  rate: number;
  effectiveFrom: string;
}

export type Field = keyof ChangeInput;
export type Result = { ok: true; value: Change } | { ok: false; errors: Partial<Record<Field, string>> };

// "6,5" (a French keyboard) and " 6.5 " mean 6.5; anything else that is not a plain decimal is not a number.
export function parseRate(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/;

function monthIndex(date: string): number {
  const [, y, m] = isoDate.exec(date)!;
  return Number(y) * 12 + Number(m) - 1;
}

export function isRealDate(date: string): boolean {
  const m = isoDate.exec(date);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export function rateError(text: string): string | undefined {
  if (text.trim() === "") return "Enter the new rate";
  const rate = parseRate(text);
  if (rate === null) return "Enter the rate as a number, like 6 or 6.5";
  if (rate < RATE_MIN || rate > RATE_MAX) return `Enter a rate between ${RATE_MIN}% and ${RATE_MAX}%`;
  if (Math.round(rate / RATE_STEP) * RATE_STEP !== rate) return `Enter the rate in steps of ${RATE_STEP}, like 6 or 6.5`;
  return undefined;
}

export function effectiveFromError(date: string, today: string): string | undefined {
  if (date === "") return "Choose when the change starts";
  if (!isRealDate(date)) return "Enter a real date";
  if (!date.endsWith("-01")) return "A change starts on the first day of a month";
  const ahead = monthIndex(date) - monthIndex(today);
  if (ahead < 1) return "A change starts next month at the earliest";
  if (ahead > MAX_MONTHS_AHEAD) return `A change starts within ${MAX_MONTHS_AHEAD} months`;
  return undefined;
}

export function validateChange(input: ChangeInput, today: string): Result {
  const errors: Partial<Record<Field, string>> = {};
  const r = rateError(input.rate);
  if (r) errors.rate = r;
  const d = effectiveFromError(input.effectiveFrom, today);
  if (d) errors.effectiveFrom = d;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { rate: parseRate(input.rate)!, effectiveFrom: input.effectiveFrom } };
}

const cents = (x: number) => Math.round(x * 100) / 100;

// What a rate means each month: the member's part, the employer's match (capped), and the total.
export function monthlyPreview(annualSalary: number, rate: number) {
  const member = cents((annualSalary * rate) / 100 / 12);
  const employer = cents((annualSalary * Math.min(rate, EMPLOYER_MATCH_CAP)) / 100 / 12);
  return { member, employer, total: cents(member + employer) };
}

// The first day of each month a change may start in, after `today`.
export function startOptions(today: string): string[] {
  const start = monthIndex(today) + 1;
  return Array.from({ length: MAX_MONTHS_AHEAD }, (_, i) => {
    const m = start + i;
    return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}-01`;
  });
}
