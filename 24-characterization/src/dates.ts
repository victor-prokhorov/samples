const DAY = 86_400_000;

export const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(utc(d) + n * DAY);
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY);

export function addYears(d: string, n: number) {
  const x = new Date(utc(d));
  x.setUTCFullYear(x.getUTCFullYear() + n);
  return iso(x.getTime());
}

export function lastDayOfMonth(period: string) {
  const x = new Date(utc(period));
  return iso(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0));
}

export function ageOn(birth: string, day: string) {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = day.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}
