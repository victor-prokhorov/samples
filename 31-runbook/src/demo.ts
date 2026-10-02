import { spawnSync } from "node:child_process";
import { db } from "./db.js";
import { lint } from "./docs-lint.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

function runbook(file: string, ...args: string[]) {
  const r = spawnSync("npx", ["tsx", "src/runner.ts", `runbooks/${file}`, "--operator", "alice", ...args], { stdio: ["ignore", "inherit", "inherit"] });
  console.log(`   => exit ${r.status}`);
  return r.status;
}

const one = async (sql: string) => (await db.query(sql)).rows[0];
const health = async () => (await (await fetch("http://localhost:53041/health")).json()).version as string;

async function main() {
  step("1. docs-lint", "every runbook has Owner, Parameters and the four sections in order, each with steps that hold an sh or manual block; every ADR has a number, a date, a valid status and Context/Decision/Consequences; links resolve");
  const broken = await lint("fixtures/broken-docs");
  for (const r of broken) for (const p of r.problems) console.log(`   ${r.file}: ${p}`);
  const real = await lint(".");
  console.log(`   real docs: ${real.map((r) => r.file).join(", ")}: ${real.reduce((n, r) => n + r.problems.length, 0)} problem(s)`);
  check(broken.flatMap((r) => r.problems).length === 9 && real.every((r) => r.problems.length === 0), "the broken fixtures fail, the real docs pass");

  step("2. First scheduled release: v1", "the runner parses the Markdown and runs Preconditions, Steps and Verification in order; every step and its outcome is stored in ops.runs / ops.steps");
  check(runbook("scheduled-release.md", "--set", "VERSION=v1", "--set", "MIGRATION=1", "--rollback", "auto") === 0 && (await health()) === "v1", "v1 released");

  step("3. Scheduled release v2", "the backup, the migration, the restart and the smoke test are the same every time, whoever is on call");
  check(runbook("scheduled-release.md", "--set", "VERSION=v2", "--set", "MIGRATION=2", "--rollback", "auto") === 0 && (await health()) === "v2", "v2 released");

  step("4. Monthly data update, then the same file again", "preconditions guard what must be true before anything changes: the second run stops at 'not loaded before', exit 2, and nothing is touched");
  check(runbook("monthly-data-update.md", "--set", "FILE=data/contributions-2026-09.csv", "--set", "PERIOD=2026-09") === 0, "file loaded");
  check(runbook("monthly-data-update.md", "--set", "FILE=data/contributions-2026-09.csv", "--set", "PERIOD=2026-09") === 2, "rerun stopped by a precondition");
  const loaded = await one("SELECT count(*)::int AS rows, sum(amount)::text AS total, (SELECT count(*)::int FROM import_batches) AS batches FROM contributions");
  console.log(`   contributions: ${loaded.rows} rows, total ${loaded.total}, ${loaded.batches} batch`);
  check(loaded.rows === 3 && loaded.batches === 1, "loaded once");

  step("5. A member request with manual steps", "a manual block is a step only a person can do; without an operator (no terminal, no --yes) the runner stops there and prints the rollback, and nothing after it runs");
  check(runbook("user-request.md", "--set", "MEMBER_ID=1", "--set", "NEW_EMAIL=alice@new.example", "--set", "TICKET=SUP-1042") === 1, "stopped at the manual step");
  check((await one("SELECT email FROM members WHERE id = 1")).email === "alice@old.example", "email unchanged");
  check(runbook("user-request.md", "--set", "MEMBER_ID=1", "--set", "NEW_EMAIL=alice@new.example", "--set", "TICKET=SUP-1042", "--yes") === 0, "done once confirmed");

  step("6. Release v3 fails its smoke test and rolls back", "a failed step stops the runbook, prints its Rollback section and, with --rollback auto, runs it: here that is rollback.md, the same procedure an engineer runs by hand");
  check(runbook("scheduled-release.md", "--set", "VERSION=v3", "--set", "MIGRATION=3", "--rollback", "auto") === 1, "v3 failed");
  const schema = await one("SELECT max(version) AS v FROM schema_migrations");
  console.log(`   after the rollback: service ${await health()}, schema version ${schema.v}`);
  check((await health()) === "v2" && schema.v === 2, "back on v2 and schema 2");
  spawnSync("ops/service.sh", ["stop"], { stdio: "inherit" });
  await db.end();
}

await main();
