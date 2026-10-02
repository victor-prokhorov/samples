import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pool } from "./db.js";
import { Case } from "./inputs.js";

export const APPROVED = "approved/legacy.approved.tsv";
export const RECEIVED = "approved/legacy.received.tsv";

export type Golden = Case & { legacy: number };

const money = (cents: number) => (cents / 100).toFixed(2);
const cents = (s: string) => Math.round(Number(s) * 100);

// Runs every input through the legacy function in Postgres and writes the outputs as a tab-separated approval file.
export async function record(cases: Case[]) {
  await pool.query("TRUNCATE cases");
  await pool.query(
    `INSERT INTO cases (id, kind, salary, birth_date, joined_on, period)
     SELECT * FROM unnest($1::int[], $2::text[], $3::numeric[], $4::date[], $5::date[], $6::date[])`,
    [cases.map((c) => c.id), cases.map((c) => c.kind), cases.map((c) => money(c.salary)), cases.map((c) => c.birthDate), cases.map((c) => c.joinedOn), cases.map((c) => c.period)],
  );
  await pool.query("UPDATE cases SET legacy = legacy_monthly_contribution(salary, birth_date, joined_on, period)");
  const { rows } = await pool.query("SELECT id, kind, salary, birth_date, joined_on, period, legacy FROM cases ORDER BY id");
  const lines = rows.map((r) => [r.id, r.kind, r.salary, r.birth_date, r.joined_on, r.period, r.legacy].join("\t"));
  writeFileSync(RECEIVED, ["id\tkind\tsalary\tbirth_date\tjoined_on\tperiod\tlegacy", ...lines].join("\n") + "\n");
}

export function approvedExists() {
  return existsSync(APPROVED);
}

export function approve() {
  writeFileSync(APPROVED, readFileSync(RECEIVED));
}

export function diffReceived() {
  const a = readFileSync(APPROVED, "utf8").split("\n");
  const r = readFileSync(RECEIVED, "utf8").split("\n");
  return r.filter((line, i) => line !== a[i]).length + Math.max(0, a.length - r.length);
}

export function readApproved(): Golden[] {
  return readFileSync(APPROVED, "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const [id, kind, salary, birthDate, joinedOn, period, legacy] = line.split("\t");
      return { id: Number(id), kind: kind as Case["kind"], salary: cents(salary), birthDate, joinedOn, period, legacy: cents(legacy) };
    });
}
