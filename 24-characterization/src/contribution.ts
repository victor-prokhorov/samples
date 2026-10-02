import { ageOn, daysBetween, lastDayOfMonth } from "./dates.js";

export type Input = { salary: number; birthDate: string; joinedOn: string; period: string };

export const RULES = ["capSalaryBeforeOffset", "midMonthCutoff", "ageByDaysOver365", "truncateToCent", "deMinimis"] as const;
export type Rule = (typeof RULES)[number];
export type Rules = Record<Rule, boolean>;

export const BOOKLET: Rules = { capSalaryBeforeOffset: false, midMonthCutoff: false, ageByDaysOver365: false, truncateToCent: false, deMinimis: false };

const CAP = 15_000_000;
const OFFSET = 600_000;

// Amounts are integer cents. The booklet is the written spec; each rule flag is a behaviour learned from the legacy function.
export function monthlyContribution(i: Input, r: Rules): number {
  if (i.salary <= 0) return 0;
  if (i.joinedOn > lastDayOfMonth(i.period)) return 0;
  if (r.midMonthCutoff && i.joinedOn.slice(0, 7) === i.period.slice(0, 7) && Number(i.joinedOn.slice(8)) > 15) return 0;
  const pensionable = r.capSalaryBeforeOffset ? Math.min(i.salary, CAP) - OFFSET : Math.min(i.salary - OFFSET, CAP);
  if (pensionable <= 0) return 0;
  const age = r.ageByDaysOver365 ? Math.floor(daysBetween(i.birthDate, i.period) / 365) : ageOn(i.birthDate, i.period);
  const percent = age < 35 ? 5 : age < 50 ? 7 : 9;
  const twelfths = pensionable * percent;
  const cents = r.truncateToCent ? Math.floor(twelfths / 1200) : Math.floor((twelfths + 600) / 1200);
  if (r.deMinimis && cents < 1000) return 0;
  return cents;
}
