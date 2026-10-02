import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { compare } from "./compare.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

const DEPLOY_DIR = resolve(".deploy");

// gitlab-ci-local warns when a predefined variable is overridden and when the repo has no origin/HEAD; neither matters here
function gcl(args: string[], vars: Record<string, string> = {}) {
  const flags = Object.entries(vars).flatMap(([k, v]) => ["--variable", `${k}=${v}`]);
  const r = spawnSync("npx", ["gitlab-ci-local", "--shell-isolation", ...args, ...flags], {
    encoding: "utf8",
    env: { ...process.env, GCL_IGNORE_PREDEFINED_VARS: "CI_PIPELINE_SOURCE,CI_COMMIT_TAG" },
  });
  const lines = (r.stdout + r.stderr).split("\n").filter((l) => l.trim() && !/origin\/HEAD|default remote branch|exit code 128/.test(l));
  return { status: r.status ?? 1, lines };
}

const list = (vars: Record<string, string> = {}) =>
  gcl(["--list"], vars)
    .lines.filter((l) => /^\w+\s+\S/.test(l) && !/^(name|parsing|json)\b/.test(l))
    .map((l) => l.trim().split(/\s+/));

function show(lines: string[], pattern: RegExp) {
  for (const l of lines.filter((l) => pattern.test(l))) console.log(`   ${l.trimEnd().replaceAll(`${process.cwd()}/`, "")}`);
}

async function main() {
  step("1. A push to a branch", "the pipeline is code in .gitlab-ci.yml; rules decide which jobs a pipeline gets. A push runs every check and the build, never the deploy, and the audit only warns there");
  const push = list();
  for (const j of push) console.log(`   ${j[0].padEnd(10)} stage ${j[1].padEnd(10)} allow_failure ${j[3]}`);
  check(!push.some((j) => j[0] === "deploy") && push.find((j) => j[0] === "audit")?.[3] === "true", "a push has no deploy and a non-blocking audit");

  step("2. Scheduled releases", "deploy only exists in a pipeline started by a schedule (cron in GitLab, e.g. Tuesdays 06:00) or by a release tag vX.Y.Z; there the audit blocks");
  for (const [label, vars] of [
    ["schedule", { CI_PIPELINE_SOURCE: "schedule" }],
    ["tag v1.4.0", { CI_COMMIT_TAG: "v1.4.0" }],
    ["tag rc-1", { CI_COMMIT_TAG: "rc-1" }],
  ] as const) {
    const jobs = list(vars);
    const deploy = jobs.find((j) => j[0] === "deploy");
    console.log(`   ${label.padEnd(11)} jobs: ${jobs.map((j) => j[0]).join(", ")}; audit allow_failure ${jobs.find((j) => j[0] === "audit")?.[3]}`);
    check(label === "tag rc-1" ? !deploy : !!deploy, `${label}: deploy ${label === "tag rc-1" ? "absent" : "present"}`);
  }

  step("3. A lint error fails the pipeline", "stages run in order and a failed job stops the later stages; tsc accepts this function, eslint does not (any, unused variable, ==)");
  // appended to a tracked file: gitlab-ci-local copies tracked files only (it excludes what git ls-files -o lists), as a runner only sees what was pushed
  const statement = readFileSync("src/statement.ts", "utf8");
  writeFileSync("src/statement.ts", `${statement}\nexport function isAdult(age: any) {\n  const unused = 1;\n  return age == 18 || age > 18;\n}\n`);
  let failed;
  try {
    failed = gcl([]);
  } finally {
    writeFileSync("src/statement.ts", statement);
  }
  show(failed.lines, /^lint\s+(\$ npm run lint|>\s+\S*statement\.ts|>\s+\d+:\d+\s+error|> .*problems)|FAIL|pipeline finished/);
  check(failed.status !== 0, "gitlab-ci-local exits non-zero");
  check(failed.lines.some((l) => /FAIL\s+lint/.test(l)) && !failed.lines.some((l) => /^(typecheck|unit|a11y|audit|build) /.test(l)), "lint failed and no later job started");

  step("4. The fix: the same pipeline passes", "each job runs in its own copy of the project (shell isolation), restores the npm cache keyed on package-lock.json, and hands its files to later jobs as artifacts");
  rmSync(".gitlab-ci-local/cache", { recursive: true, force: true });
  const green = gcl([]);
  show(green.lines, /^\w+\s+(\$ npm run|\$ npx|imported cache|cache created|exported artifacts|> added)|^\w+\s+> .*(Tests |rules passed|vulnerabilities|JUNIT)|PASS|pipeline finished/);
  check(green.status === 0 && ["lint", "typecheck", "unit", "a11y", "audit", "build"].every((j) => green.lines.some((l) => new RegExp(`PASS\\s+${j}\\b`).test(l))), "all six jobs pass");
  check(!green.lines.some((l) => /^lint\s+imported cache/.test(l)) && green.lines.some((l) => /^build\s+imported cache/.test(l)), "the first job starts cold, later jobs restore the cache");
  check(existsSync("reports/junit.xml") && existsSync("dist/server.js"), "artifacts: junit report and dist/");

  step("5. A scheduled pipeline deploys", "the deploy job needs build (it downloads dist/ from it), runs in the production environment, one at a time (resource_group), and switches a symlink so the release goes live atomically");
  rmSync(DEPLOY_DIR, { recursive: true, force: true });
  const scheduled = gcl([], { CI_PIPELINE_SOURCE: "schedule", DEPLOY_DIR });
  show(scheduled.lines, /^deploy\s+(\$ |> )|PASS|FAIL|pipeline finished/);
  check(scheduled.status === 0, "the scheduled pipeline passes, deploy included");
  const first = readlinkSync(`${DEPLOY_DIR}/current`);
  console.log(`   .deploy/current -> ${first}`);

  step("6. A release tag deploys too, and the previous release stays for rollback", "gitlab-ci-local --needs deploy runs deploy and what it depends on (build, which has no needs:, so every earlier stage); rolling back is pointing current at the previous release");
  const tagged = gcl(["--needs", "deploy"], { CI_COMMIT_TAG: "v1.4.0", DEPLOY_DIR });
  show(tagged.lines, /^deploy\s+> |PASS|FAIL|pipeline finished/);
  const current = readlinkSync(`${DEPLOY_DIR}/current`);
  const release = JSON.parse(readFileSync(`${DEPLOY_DIR}/current/release.json`, "utf8"));
  console.log(`   current -> ${current}, release.json ${JSON.stringify(release)}; previous ${first} still on disk: ${existsSync(`${DEPLOY_DIR}/${first}`)}`);
  check(tagged.status === 0 && current === "releases/v1.4.0" && release.source === "push", "tag v1.4.0 is live");

  step("7. The same pipeline on GitHub Actions", "github-actions/ci.yml (not under .github/, so it does not run here) has the same jobs, commands in the same order, runners and deploy triggers; stages become needs, rules become if and on:, resource_group becomes concurrency, runner tags become runs-on labels");
  const printCompare = (c: Awaited<ReturnType<typeof compare>>) => {
    console.log(`   ${"job".padEnd(10)} ${"gitlab stage".padEnd(13)} ${"github needs".padEnd(13)} ${"runner".padEnd(11)} commands`);
    for (const r of c.rows) {
      const runner = r.runner.gitlab === r.runner.github ? r.runner.gitlab : `${r.runner.gitlab} vs ${r.runner.github}`;
      console.log(`   ${r.name.padEnd(10)} ${r.stage.padEnd(13)} ${r.needs.padEnd(13)} ${runner.padEnd(11)} ${r.same ? r.gl : `DIFFERENT: ${r.gl} vs ${r.gh}`}`);
    }
    console.log(`   deploys on: ${c.deploys.map((d) => `${d.trigger} ${d.gitlab === d.github ? (d.gitlab ? "yes" : "no") : `DIFFERENT (gitlab ${d.gitlab ? "yes" : "no"}, github ${d.github ? "yes" : "no"})`}`).join("; ")}`);
  };
  const same = await compare();
  printCompare(same);
  check(same.rows.every((r) => r.same) && same.deploys.every((d) => d.gitlab === d.github), "both pipelines run the same commands in the same order, on the same runners, and deploy on the same triggers");
  const deploys = same.deploys.filter((d) => d.gitlab).map((d) => d.trigger);
  check(deploys.join() === "schedule,tag v1.4.0", "only the schedule and a vX.Y.Z tag deploy");

  console.log("   the comparison on a drifted copy (smoke test after the switch, release.json dropped, deploy on ubuntu-latest, a loose tag filter and tag check):");
  const original = readFileSync("github-actions/ci.yml", "utf8");
  const smoke = original.split("\n").find((l) => l.includes("node -e \"import("))!;
  const drifted = original
    .replace(`${smoke}\n`, "")
    .replace(/^( +)(echo "deployed)/m, `${smoke.replace("releases/$RELEASE", "current")}\n$1$2`)
    .replace(/^ +printf .*release\.json"\n/m, "")
    .replace("runs-on: [self-hosted, production]", "runs-on: ubuntu-latest")
    .replace(/tags: \["[^"]+"\]/, 'tags: ["v*.*.*"]')
    .replace(/=~ \S+ \]\]/, "=~ ^v ]]");
  const dir = mkdtempSync(join(tmpdir(), "pipeline-"));
  try {
    writeFileSync(join(dir, "ci.yml"), drifted);
    const diff = await compare(join(dir, "ci.yml"));
    printCompare({ ...diff, rows: diff.rows.filter((r) => !r.same) });
    check(!diff.rows.find((r) => r.name === "deploy")!.same && diff.deploys.some((d) => d.gitlab !== d.github), "the drifted copy is caught: deploy commands, runner and tag rule differ");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

await main();
