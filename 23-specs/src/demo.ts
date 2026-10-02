import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { pool } from "./db.js";
import { matrix, printMatrix, readRun } from "./trace.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

function cucumber(impl: string, format: string) {
  const report = `reports/${impl}.ndjson`;
  const r = spawnSync("node_modules/.bin/cucumber-js", ["--format", format, "--format", `message:${report}`], {
    stdio: "inherit",
    env: { ...process.env, IMPL: impl, NODE_OPTIONS: "--import tsx" },
  });
  console.log(`   cucumber-js exit code (IMPL=${impl}): ${r.status}`);
  return { exit: r.status, ...readRun(report) };
}

async function store(impl: string, rows: ReturnType<typeof matrix>) {
  for (const r of rows)
    for (const s of r.scenarios)
      await pool.query("INSERT INTO spec_results (implementation, requirement, scenario, status) VALUES ($1, $2, $3, $4)", [impl, r.id, s.scenario, s.status]);
}

mkdirSync("reports", { recursive: true });

step("1. The specs against the naive implementation", "the feature file is the acceptance criteria; run it before trusting code written from a one-line ticket");
const naive = cucumber("naive", "summary");
check(naive.exit !== 0, "the naive implementation fails the specs");

step("2. Traceability for the naive run", "every scenario inherits the @REQ-xx tag of its Rule, so results roll up to requirements");
const naiveMatrix = matrix(naive.requirements, naive.results);
printMatrix(naiveMatrix);
const failing = naiveMatrix.filter((r) => r.verdict.startsWith("FAILING")).map((r) => r.id);
check(failing.join() === "REQ-02,REQ-03,REQ-04", `naive fails exactly REQ-02, REQ-03, REQ-04 (got ${failing})`);
await store("naive", naiveMatrix);

step("3. The same specs against the domain implementation", "nothing in the feature file changes; only the code under it does");
const domain = cucumber("domain", "pretty");
check(domain.exit === 0, "the domain implementation passes the specs");

step("4. Traceability for the domain run", "a requirement is done when it has at least one scenario and all of them pass");
const domainMatrix = matrix(domain.requirements, domain.results);
printMatrix(domainMatrix);
check(domainMatrix.every((r) => r.verdict.startsWith("passing")), "every requirement is covered and passing");
check(domain.results.every((s) => s.requirements.length === 1), "every scenario traces to exactly one requirement");
await store("domain", domainMatrix);
console.log(`   ${domainMatrix.length} requirements, ${domain.results.length} scenarios, all passing`);

await pool.end();
