import { addDays, addYears, iso, lastDayOfMonth, utc } from "./dates.js";
import { Input } from "./contribution.js";

export type Case = Input & { id: number; kind: "boundary" | "random" };

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERIODS = ["2024-02-01", "2024-03-01", "2025-07-01", "2026-03-01"];
const SALARIES = [-10000, 0, 1, 599_999, 600_000, 600_001, 733_333, 733_334, 771_428, 771_429, 839_999, 840_000, 840_001, 3_600_000, 3_612_345, 14_999_999, 15_000_000, 15_000_001, 15_600_000, 25_000_000];
const BIRTHS = ["1995-06-15", "1980-06-15", "1965-06-15"];
const DAY_SHIFTS = [-1, 0, 1, 2, 8, 9, 10, 12, 13, 31];

export function generateInputs(seed: number, randomCount: number): Case[] {
  const cases: Input[] = [];
  const base = { salary: 4_800_000, birthDate: "1980-06-15", joinedOn: "2010-01-04" };
  for (const period of PERIODS) {
    for (const salary of SALARIES) for (const birthDate of BIRTHS) cases.push({ ...base, salary, birthDate, period });
    for (const years of [35, 50]) for (const k of DAY_SHIFTS) cases.push({ ...base, birthDate: addDays(addYears(period, -years), k), period });
    for (const birthDate of ["1976-02-29", "1992-02-29"]) cases.push({ ...base, birthDate, period });
    const joins = [addDays(period, -1), period, addDays(period, 14), addDays(period, 15), lastDayOfMonth(period), addDays(lastDayOfMonth(period), 1)];
    for (const joinedOn of joins) cases.push({ ...base, joinedOn, period });
  }
  const boundary = cases.length;
  const rnd = mulberry32(seed);
  const between = (a: string, b: string) => iso(utc(a) + Math.floor(rnd() * (utc(b) - utc(a) + 1) / 86_400_000) * 86_400_000);
  for (let n = 0; n < randomCount; n++) {
    const band = rnd();
    const salary = Math.floor(band < 0.1 ? rnd() * 1_000_000 : band < 0.9 ? 1_000_000 + rnd() * 14_000_000 : 15_000_000 + rnd() * 15_000_000);
    const period = `${2020 + Math.floor(rnd() * 8)}-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}-01`;
    const birthDate = between("1950-01-01", "2004-12-31");
    const joinedOn = rnd() < 0.8 ? between("2000-01-01", period) : between(addDays(period, -31), addDays(period, 45));
    cases.push({ salary, birthDate, joinedOn, period });
  }
  return cases.map((c, i) => ({ ...c, id: i + 1, kind: i < boundary ? "boundary" : "random" }));
}
