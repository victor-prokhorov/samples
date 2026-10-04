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
  step("1. docs-lint", "every runbook has Owner, Parameters and the four sections in order, each with steps that hold an sh or manual block and no block outside a step; every ADR has a number, a date, a valid status and Context/Decision/Consequences; links resolve");
  const broken = await lint("fixtures/broken-docs");
  for (const r of broken) for (const p of r.problems) console.log(`   ${r.file}: ${p}`);
  const real = await lint(".");
  console.log(`   real docs: ${real.map((r) => r.file).join(", ")}: ${real.reduce((n, r) => n + r.problems.length, 0)} problem(s)`);
  check(broken.flatMap((r) => r.problems).length === 10 && real.every((r) => r.problems.length === 0), "the broken fixtures fail, the real docs pass");

  step("2. First scheduled release: v1", "the runner parses the Markdown and runs Preconditions, Steps and Verification in order; every step and its outcome is stored in ops.runs / ops.steps");
  check(runbook("scheduled-release.md", "--set", "VERSION=v1", "--set", "MIGRATION=1", "--rollback", "auto") === 0 && (await health()) === "v1", "v1 released");

  step("3. Scheduled release v2", "the backup, the migration, the restart and the smoke test are the same every time, whoever is on call");
  check(runbook("scheduled-release.md", "--set", "VERSION=v2", "--set", "MIGRATION=2", "--rollback", "auto") === 0 && (await health()) === "v2", "v2 released");

  step("4. Monthly data update, the same file again, then a corrected file", "preconditions guard what must be true before anything changes: the same file stops at 'not loaded before', a corrected file for a loaded period at 'no batch for this period yet', both with exit 2 and nothing touched; the rollback only ever removes its own batch");
  check(runbook("monthly-data-update.md", "--set", "FILE=data/contributions-2026-09.csv", "--set", "PERIOD=2026-09") === 0, "file loaded");
  check(runbook("monthly-data-update.md", "--set", "FILE=data/contributions-2026-09.csv", "--set", "PERIOD=2026-09") === 2, "rerun stopped by a precondition");
  check(runbook("monthly-data-update.md", "--set", "FILE=data/contributions-2026-09-corrected.csv", "--set", "PERIOD=2026-09") === 2, "corrected file stopped by a precondition");
  const loaded = await one("SELECT count(*)::int AS rows, sum(amount)::text AS total, (SELECT count(*)::int FROM import_batches) AS batches FROM contributions");
  console.log(`   contributions: ${loaded.rows} rows, total ${loaded.total}, ${loaded.batches} batch`);
  check(loaded.rows === 3 && loaded.total === "1102.75" && loaded.batches === 1, "loaded once, the verified load untouched");

  step("5. A member request with manual steps", "a manual block is a step only a person can do; without an operator (no terminal, no --yes) the runner stops there and prints the rollback, and nothing after it runs");
  check(runbook("user-request.md", "--set", "MEMBER_ID=1", "--set", "NEW_EMAIL=alice@new.example", "--set", "TICKET=SUP-1042") === 1, "stopped at the manual step");
  check((await one("SELECT email FROM members WHERE id = 1")).email === "alice@old.example", "email unchanged");
  check(runbook("user-request.md", "--set", "MEMBER_ID=1", "--set", "NEW_EMAIL=alice@new.example", "--set", "TICKET=SUP-1042", "--yes") === 0, "done once confirmed");
  console.log("   parameters reach SQL as psql variables, so a quote in an address is data, not SQL:");
  check(runbook("user-request.md", "--set", "MEMBER_ID=2", "--set", "NEW_EMAIL=bob.o'brien@example.org", "--set", "TICKET=SUP-1043", "--yes") === 0, "o'brien done");
  const bob = await one("SELECT m.email, c.old_value, c.new_value FROM members m JOIN member_changes c ON c.member_id = m.id WHERE m.id = 2");
  console.log(`   member 2: ${JSON.stringify(bob)}`);
  check(bob.email === "bob.o'brien@example.org" && bob.new_value === bob.email, "the address is stored as typed");

  step("6. Release v3 fails its smoke test and rolls back", "a failed step stops the runbook, prints its Rollback section and, with --rollback auto, runs it: here that is rollback.md, the same procedure an engineer runs by hand");
  check(runbook("scheduled-release.md", "--set", "VERSION=v3", "--set", "MIGRATION=3", "--rollback", "auto") === 1, "v3 failed");
  const schema = await one("SELECT max(version) AS v FROM schema_migrations");
  console.log(`   after the rollback: service ${await health()}, schema version ${schema.v}`);
  check((await health()) === "v2" && schema.v === 2, "back on v2 and schema 2");
  spawnSync("ops/service.sh", ["stop"], { stdio: "inherit" });

  step(
    "7. Backup and restore drill",
    "a base backup (pg_basebackup) plus the WAL archive restores to any point after it: the drill keeps writing after the backup, deletes every contribution, finds the DELETE's transaction with pg_waldump, restores a fresh container to just before it, compares row counts and checksums, puts the rows back, and measures RPO and RTO against their targets",
  );
  const before = await one("SELECT count(*)::int AS n FROM contributions");
  check(runbook("backup-restore-drill.md", "--set", "RPO_TARGET=60", "--set", "RTO_TARGET=300", "--rollback", "auto") === 0, "the drill succeeded");
  const drill = await one("SELECT id FROM ops.runs WHERE runbook = 'runbooks/backup-restore-drill.md'");
  const after = await one("SELECT count(*)::int AS n, count(*) FILTER (WHERE period = '2026-10')::int AS october FROM contributions");
  console.log(`   contributions: ${before.n} before the drill, ${after.n} after it (${after.october} loaded after the backup, deleted, then put back)`);
  check(after.n === before.n + 3 && after.october === 3, "every row is back, including the ones written after the base backup");
  const children = await one(`SELECT count(*)::int AS n FROM ops.runs WHERE parent = ${Number(drill.id)} AND outcome = 'succeeded'`);
  check(children.n === 2, "the monthly load and the member request ran after the backup, as child runs");
  const measured = await one(`SELECT output FROM ops.steps WHERE run_id = ${Number(drill.id)} AND section = 'Verification' AND step LIKE '2.%'`);
  const rpo = /RPO ([\d.]+) s \(target 60 s\)/.exec(measured.output);
  const rto = /RTO ([\d.]+) s \(target 300 s\)/.exec(measured.output);
  console.log(`   measured: RPO ${rpo?.[1]} s, RTO ${rto?.[1]} s`);
  check(!!rpo && !!rto && Number(rpo[1]) <= 60 && Number(rto[1]) <= 300, "RPO and RTO measured and within their targets");
  const left = spawnSync("docker", ["compose", "--profile", "drill", "ps", "-aq", "restore"], { encoding: "utf8" });
  check(left.status === 0 && left.stdout.trim() === "", "the restore container is gone");
  await db.end();
}

await main();
