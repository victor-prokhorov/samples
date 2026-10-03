// The seed, shared by setup.ts (which writes it) and demo.ts (which sends traffic at it).
// Members get ids 1..760 in this order; the last three (Initech) joined this month and have no contribution yet.
export const EMPLOYERS = [
  { code: "acme", name: "Acme", members: 600 },
  { code: "globex", name: "Globex", members: 120 },
  { code: "initech", name: "Initech", members: 40 },
];
export const MEMBERS = EMPLOYERS.reduce((s, e) => s + e.members, 0);
export const JOINERS = [MEMBERS - 2, MEMBERS - 1, MEMBERS];
export const MONTHS = 24;
