import { writeFileSync } from "node:fs";
import { pool } from "./db.js";
import { BOOKLET, RULES, Rule, Rules, monthlyContribution } from "./contribution.js";
import { DECISIONS } from "./decisions.js";
import { generateInputs } from "./inputs.js";
import { APPROVED, Golden, approve, approvedExists, diffReceived, readApproved, record } from "./golden.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

const money = (cents: number) => (cents / 100).toFixed(2);
const row = (g: Golden, out: number) =>
  `   #${String(g.id).padEnd(5)} salary ${money(g.salary).padStart(10)}  born ${g.birthDate}  joined ${g.joinedOn}  period ${g.period}  legacy ${money(g.legacy).padStart(8)}  rewrite ${money(out).padStart(8)}`;

function subsets<T>(items: readonly T[]): T[][] {
  const all = items.reduce<T[][]>((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]]);
  return all.slice(1).sort((a, b) => a.length - b.length);
}

const withRules = (base: Rules, on: readonly Rule[]) => ({ ...base, ...Object.fromEntries(on.map((r) => [r, true])) }) as Rules;

// The smallest set of hypotheses that, switched on in the booklet version, reproduces the legacy output.
function explain(g: Golden): Rule[] | null {
  return subsets(RULES).find((s) => monthlyContribution(g, withRules(BOOKLET, s)) === g.legacy) ?? null;
}

const FINAL = Object.fromEntries(DECISIONS.map((d) => [d.rule, d.decision === "keep"])) as Rules;
const FIXED = DECISIONS.filter((d) => d.decision === "fix").map((d) => d.rule);

function verify(golden: Golden[], rules: Rules) {
  const out = { equal: 0, allowlisted: [] as Golden[], unexplained: [] as Golden[] };
  for (const g of golden) {
    if (monthlyContribution(g, rules) === g.legacy) out.equal++;
    else if (monthlyContribution(g, withRules(rules, FIXED)) === g.legacy) out.allowlisted.push(g);
    else out.unexplained.push(g);
  }
  return out;
}

step("1. Generate inputs", "boundary values on every threshold the code might have (cap, offset, minimum, birthdays, join days, leap years) plus seeded random cases");
const cases = generateInputs(2026, 1000);
console.log(`   ${cases.filter((c) => c.kind === "boundary").length} boundary + ${cases.filter((c) => c.kind === "random").length} random (seed 2026) = ${cases.length} cases`);

step("2. Record the golden master", "run every input through the legacy PL/pgSQL and keep the outputs in a committed approval file; the legacy output is the spec");
await record(cases);
if (!approvedExists()) {
  approve();
  console.log(`   no ${APPROVED} yet: received output approved as the golden master`);
}
const changed = diffReceived();
console.log(`   legacy outputs differing from ${APPROVED}: ${changed}`);
check(changed === 0, "the legacy function still produces the approved outputs");
const golden = readApproved();
console.log(`   ${golden.length} approved cases, ${golden.filter((g) => g.legacy === 0).length} of them 0.00`);

step("3. The rewrite from the booklet, against the golden master", "the written rules (5/7/9% of salary above 6,000 capped at 150,000, rounded, from the month of joining) are not what the system does");
const bookletMismatches = golden.filter((g) => monthlyContribution(g, BOOKLET) !== g.legacy);
console.log(`   ${bookletMismatches.length} of ${golden.length} cases differ`);
const explained = new Map<string, Golden[]>();
for (const g of bookletMismatches) {
  const key = explain(g)?.join(" + ") ?? "UNEXPLAINED";
  explained.set(key, [...(explained.get(key) ?? []), g]);
}
for (const [, gs] of explained) console.log(row(gs[0], monthlyContribution(gs[0], BOOKLET)));
check(bookletMismatches.length > 0, "the booklet does not describe the legacy behaviour");

step("4. Discover the rules from the mismatches", "turn each pattern into a hypothesis, switch it on in the rewrite, and keep it if it reproduces legacy; a mismatch is explained by the smallest set that does");
for (const [key, gs] of [...explained].sort((a, b) => b[1].length - a[1].length)) console.log(`   ${String(gs.length).padStart(4)}  ${key}`);
check(!explained.has("UNEXPLAINED"), "every mismatch is explained by a hypothesis");
const perRule = Object.fromEntries(RULES.map((r) => [r, bookletMismatches.filter((g) => explain(g)!.includes(r)).length]));

step("5. Decide per rule: keep the quirk or fix it on purpose", "kept rules become the rewrite's behaviour; fixed ones go on an allowlist with a reason, so their mismatches are expected and nothing else is");
for (const d of DECISIONS) console.log(`   ${d.decision.toUpperCase().padEnd(4)} ${d.rule.padEnd(21)} ${d.why}`);

step("6. The final rewrite, against the golden master", "equal, or differing only where a documented fix says it must; zero unexplained mismatches is the green bar");
const final = verify(golden, FINAL);
console.log(`   ${golden.length} cases: ${final.equal} equal, ${final.allowlisted.length} allowlisted (${FIXED.join(", ")}), ${final.unexplained.length} unexplained`);
for (const g of final.allowlisted.slice(0, 4)) console.log(row(g, monthlyContribution(g, FINAL)));
check(final.unexplained.length === 0, "no unexplained mismatch");
check(final.allowlisted.length > 0, "the fix changes some outputs, as decided");

step("7. The golden master catches a regression", "someone 'tidies' the truncation into rounding: those mismatches are on no allowlist, so the check goes red");
const regression = verify(golden, { ...FINAL, truncateToCent: false });
console.log(`   ${regression.unexplained.length} unexplained mismatches, for example:`);
for (const g of regression.unexplained.slice(0, 2)) console.log(row(g, monthlyContribution(g, { ...FINAL, truncateToCent: false })));
check(regression.unexplained.length > 0, "the regression is caught");

step("8. The decision table", "what was learned, written for people: one row per rule, with where it came from and what was decided");
const table = [
  "| # | When | Then | Source | Decision |",
  "| --- | --- | --- | --- | --- |",
  "| R1 | salary is 0 or less | 0.00 | booklet | |",
  "| R2 | joined after the last day of the period | 0.00 | booklet | |",
  ...DECISIONS.map((d, i) => `| R${i + 3} | ${d.when} | ${d.then} | legacy, ${perRule[d.rule]} mismatches | ${d.decision}: ${d.why} |`),
].join("\n");
writeFileSync("decision-table.md", `# Monthly contribution: decision table\n\nGenerated by \`npm run demo\` from \`src/decisions.ts\` and the golden master.\n\n${table}\n`);
console.log(table.replace(/^/gm, "   "));

const verdicts = new Map(golden.map((g) => [g.id, "equal"]));
for (const g of final.allowlisted) verdicts.set(g.id, `allowlisted: fix ${FIXED.join(", ")}`);
await pool.query(
  `UPDATE cases c SET booklet = v.booklet / 100.0, rewrite = v.rewrite / 100.0, explained_by = v.explained_by, verdict = v.verdict
   FROM unnest($1::int[], $2::int[], $3::int[], $4::text[], $5::text[]) AS v(id, booklet, rewrite, explained_by, verdict) WHERE c.id = v.id`,
  [
    golden.map((g) => g.id),
    golden.map((g) => monthlyContribution(g, BOOKLET)),
    golden.map((g) => monthlyContribution(g, FINAL)),
    golden.map((g) => (monthlyContribution(g, BOOKLET) === g.legacy ? null : explain(g)!.join(" + "))),
    golden.map((g) => verdicts.get(g.id)!),
  ],
);
await pool.end();
