import { Rule } from "./contribution.js";

export type Decision = { rule: Rule; when: string; then: string; decision: "keep" | "fix"; why: string };

// One entry per rule learned from the golden master: kept as the rule of record, or changed on purpose.
export const DECISIONS: Decision[] = [
  {
    rule: "midMonthCutoff",
    when: "joined in the period's month after the 15th",
    then: "0.00 for that month",
    decision: "keep",
    why: "payroll closes on the 15th; the booklet never said so, but every employer's payroll relies on it",
  },
  {
    rule: "capSalaryBeforeOffset",
    when: "salary above 150,000.00",
    then: "pensionable = min(salary, 150,000.00) - 6,000.00, so at most 144,000.00",
    decision: "keep",
    why: "the cap is on the payroll salary field; the booklet's wording was ambiguous and 15 years of statements follow legacy",
  },
  {
    rule: "ageByDaysOver365",
    when: "age on the 1st of the period: under 35 / 35 to 49 / 50 and over",
    then: "rate 5% / 7% / 9% of pensionable salary",
    decision: "fix",
    why: "legacy counts age as days / 365, so leap days make members older: up to 9 days before a 35th birthday and 13 before a 50th they pay the higher rate",
  },
  {
    rule: "truncateToCent",
    when: "pensionable x rate / 12 has more than 2 decimals",
    then: "truncated to the cent, never rounded up",
    decision: "keep",
    why: "employers deduct the truncated amount; rounding would open a 0.01 reconciliation difference on about half the members every month",
  },
  {
    rule: "deMinimis",
    when: "the monthly amount is under 10.00",
    then: "0.00",
    decision: "keep",
    why: "collecting it costs more than it is worth; it is in the employer agreement, not in the booklet",
  },
];
