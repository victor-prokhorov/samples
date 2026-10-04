import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { compare } from "./compare.js";
import { AZURE_PATCH, SCHEMAS, type Platform, validate } from "./validate.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

const DEPLOY_DIR = resolve(".deploy");

// gitlab-ci-local warns when a predefined variable is overridden, when the repo has no origin/HEAD and when git has no
// user identity (CI runners); none of that matters here. Colours are stripped so the checks read the same on a terminal and in CI.
function gcl(args: string[], vars: Record<string, string> = {}) {
  const flags = Object.entries(vars).flatMap(([k, v]) => ["--variable", `${k}=${v}`]);
  const r = spawnSync("npx", ["gitlab-ci-local", "--shell-isolation", ...args, ...flags], {
    encoding: "utf8",
    env: { ...process.env, GCL_IGNORE_PREDEFINED_VARS: "CI_PIPELINE_SOURCE,CI_COMMIT_TAG" },
  });
  const lines = stripVTControlCharacters(r.stdout + r.stderr)
    .split("\n")
    .filter((l) => l.trim() && !/origin\/HEAD|default remote branch|exit code 128|Using fallback/.test(l));
  return { status: r.status ?? 1, lines };
}

const list = (vars: Record<string, string> = {}) =>
  gcl(["--list"], vars)
    .lines.filter((l) => /^\w+\s+\S/.test(l) && !/^(name|parsing|json)\b/.test(l))
    .map((l) => l.trim().split(/\s+/));

function show(lines: string[], pattern: RegExp) {
  for (const l of lines.filter((l) => pattern.test(l))) console.log(`   ${l.trimEnd().replaceAll(`${process.cwd()}/`, "")}`);
}

// Appends code to a tracked file for one pipeline run: gitlab-ci-local copies tracked files only (it excludes what
// git ls-files -o lists), as a runner only sees what was pushed.
function withAppended<T>(file: string, code: string, run: () => T): T {
  const original = readFileSync(file, "utf8");
  writeFileSync(file, `${original}${code}`);
  try {
    return run();
  } finally {
    writeFileSync(file, original);
  }
}

// a PNG of an HTML report, with the shared renderer in ../tools (Chromium from PLAYWRIGHT_BROWSERS_PATH)
function screenshot(html: string, png: string) {
  mkdirSync("screenshots", { recursive: true });
  const r = spawnSync("node", ["../tools/render.mjs", "html", html, png, "1000"], { encoding: "utf8" });
  check(r.status === 0 && existsSync(png), `screenshot ${png} (${r.stderr.trim()})`);
  console.log(`   screenshot: ${png} (${html})`);
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
  const failed = withAppended("src/statement.ts", "\nexport function isAdult(age: any) {\n  const unused = 1;\n  return age == 18 || age > 18;\n}\n", () => gcl([]));
  show(failed.lines, /^lint\s+(\$ npm run lint|>\s+\S*statement\.ts|>\s+\d+:\d+\s+error|> .*problems)|FAIL|pipeline finished/);
  check(failed.status !== 0, "gitlab-ci-local exits non-zero");
  check(failed.lines.some((l) => /FAIL\s+lint/.test(l)) && !failed.lines.some((l) => /^(typecheck|unit|a11y|audit|build) /.test(l)), "lint failed and no later job started");

  step("4. Untested code fails the coverage gate", "the unit job runs vitest --coverage; vitest.config.ts sets thresholds (lines, statements, functions 90%, branches 85%) and vitest exits non-zero below them, so the job and the pipeline fail. This function passes lint and tsc but has no test");
  rmSync("reports/coverage", { recursive: true, force: true });
  const untested = "\nexport function monthlyAverageCents(contributions: Contribution[], year: number) {\n  const months = new Set(contributions.filter((c) => c.month.startsWith(`${year}-`)).map((c) => c.month));\n  if (months.size === 0) return 0;\n  return Math.round(annualTotalCents(contributions, year) / months.size);\n}\n";
  // gitlab-ci-local <job> runs that one job; the coverage report is an artifact with when: always, so it is exported on failure too
  const gate = withAppended("src/statement.ts", untested, () => gcl(["unit"]));
  show(gate.lines, /^unit\s+(\$ npx vitest|> (\s*Tests |All files|\s*statement\.ts|\s*page\.ts|Statements|Branches|Functions|Lines|ERROR: Coverage))|FAIL|PASS|pipeline finished/);
  check(gate.status !== 0 && gate.lines.some((l) => /FAIL\s+unit/.test(l)), "the unit job fails");
  check(gate.lines.some((l) => /Tests\s+8 passed/.test(l)) && gate.lines.some((l) => /ERROR: Coverage for lines \([\d.]+%\) does not meet global threshold \(90%\)/.test(l)), "every test passes: it fails on the coverage threshold");
  screenshot("reports/coverage/statement.ts.html", "screenshots/coverage-gate-failed.png");

  step("5. With its tests, the same pipeline passes", "each job runs in its own copy of the project (shell isolation), restores the npm cache keyed on package-lock.json, and hands its files to later jobs as artifacts (JUnit, coverage, a11y, dist/)");
  rmSync(".gitlab-ci-local/cache", { recursive: true, force: true });
  rmSync("reports/coverage", { recursive: true, force: true });
  const green = gcl([]);
  show(green.lines, /^\w+\s+(\$ npm run|\$ npx|imported cache|cache created|exported artifacts|> added)|^\w+\s+> .*(Tests |rules passed|vulnerabilities|JUNIT)|^unit\s+> (Statements|Branches|Functions|Lines)|PASS|pipeline finished/);
  check(green.status === 0 && ["lint", "typecheck", "unit", "a11y", "audit", "build"].every((j) => green.lines.some((l) => new RegExp(`PASS\\s+${j}\\b`).test(l))), "all six jobs pass");
  check(green.lines.some((l) => /^unit\s+> Lines\s+: 100%/.test(l)), "coverage back above the gate");
  check(!green.lines.some((l) => /^lint\s+imported cache/.test(l)) && green.lines.some((l) => /^build\s+imported cache/.test(l)), "the first job starts cold, later jobs restore the cache");
  check(existsSync("reports/junit.xml") && existsSync("reports/coverage/cobertura-coverage.xml") && existsSync("dist/server.js"), "artifacts: junit report, coverage report and dist/");
  screenshot("reports/coverage/index.html", "screenshots/coverage-gate-passed.png");

  step("6. A scheduled pipeline deploys", "the deploy job needs build (it downloads dist/ from it), runs in the production environment, one at a time (resource_group), and switches a symlink so the release goes live atomically");
  rmSync(DEPLOY_DIR, { recursive: true, force: true });
  const scheduled = gcl([], { CI_PIPELINE_SOURCE: "schedule", DEPLOY_DIR });
  show(scheduled.lines, /^deploy\s+(\$ |> )|PASS|FAIL|pipeline finished/);
  check(scheduled.status === 0, "the scheduled pipeline passes, deploy included");
  const first = readlinkSync(`${DEPLOY_DIR}/current`);
  console.log(`   .deploy/current -> ${first}`);

  step("7. A release tag deploys too, and the previous release stays for rollback", "gitlab-ci-local --needs deploy runs deploy and what it depends on (build, which has no needs:, so every earlier stage); rolling back is pointing current at the previous release");
  const tagged = gcl(["--needs", "deploy"], { CI_COMMIT_TAG: "v1.4.0", DEPLOY_DIR });
  show(tagged.lines, /^deploy\s+> |PASS|FAIL|pipeline finished/);
  const current = readlinkSync(`${DEPLOY_DIR}/current`);
  const release = JSON.parse(readFileSync(`${DEPLOY_DIR}/current/release.json`, "utf8"));
  console.log(`   current -> ${current}, release.json ${JSON.stringify(release)}; previous ${first} still on disk: ${existsSync(`${DEPLOY_DIR}/${first}`)}`);
  check(tagged.status === 0 && current === "releases/v1.4.0" && release.source === "push", "tag v1.4.0 is live");

  step(
    "8. The same pipeline on GitHub Actions and Azure Pipelines",
    "github-actions/ci.yml and azure-pipelines.yml (neither runs here) have the same jobs, commands in the same order (coverage flag included), runners, deploy triggers and audit rule. GitHub: stages become needs, rules become if and on:. Azure: stages stay stages (each after the previous one), rules become conditions, runner tags become an environment's VM resource",
  );
  const yn = (b: boolean) => (b ? "yes" : "no");
  const printCompare = (c: Awaited<ReturnType<typeof compare>>) => {
    console.log(`   ${"job".padEnd(10)} ${"gitlab stage".padEnd(13)} ${"github needs".padEnd(13)} ${"azure stage (after)".padEnd(20)} ${"runner".padEnd(11)} commands`);
    for (const r of c.rows) {
      const runners = new Set(Object.values(r.runner));
      const runner = runners.size === 1 ? r.runner.gitlab : `gitlab ${r.runner.gitlab}, github ${r.runner.github}, azure ${r.runner.azure}`;
      const cmds = r.gl === r.gh && r.gl === r.az ? r.gl : `DIFFERENT: gitlab ${r.gl} | github ${r.gh} | azure ${r.az}`;
      console.log(`   ${r.name.padEnd(10)} ${r.stage.padEnd(13)} ${r.needs.padEnd(13)} ${r.azure.padEnd(20)} ${runner.padEnd(11)} ${cmds}`);
    }
    const verdict = (d: { gitlab: boolean; github: boolean; azure: boolean }) =>
      d.gitlab === d.github && d.gitlab === d.azure ? yn(d.gitlab) : `DIFFERENT (gitlab ${yn(d.gitlab)}, github ${yn(d.github)}, azure ${yn(d.azure)})`;
    console.log(`   deploys on: ${c.deploys.map((d) => `${d.trigger} ${verdict(d)}`).join("; ")}`);
    console.log(`   audit blocks on: ${c.audit.map((d) => `${d.trigger} ${verdict(d)}`).join("; ")}`);
  };
  const agree = (d: { gitlab: boolean; github: boolean; azure: boolean }) => d.gitlab === d.github && d.gitlab === d.azure;
  const same = await compare();
  printCompare(same);
  check(same.rows.every((r) => r.same) && same.deploys.every(agree) && same.audit.every(agree), "all three pipelines run the same commands in the same order, on the same runners, deploy on the same triggers and block on the audit for the same ones");
  check(same.deploys.filter((d) => d.gitlab).map((d) => d.trigger).join() === "schedule,tag v1.4.0", "only the schedule and a vX.Y.Z tag deploy");
  check(same.audit.map((d) => yn(d.gitlab)).join() === "yes,no,yes", "the audit blocks the schedule and the tag, not a push");

  const dir = mkdtempSync(join(tmpdir(), "pipeline-"));
  try {
    console.log("   the comparison on drifted copies. GitHub: smoke test after the switch, release.json dropped, deploy on ubuntu-latest, a loose tag filter and tag check:");
    const github = readFileSync("github-actions/ci.yml", "utf8");
    const smoke = github.split("\n").find((l) => l.includes('node -e "import('))!;
    writeFileSync(
      join(dir, "ci.yml"),
      github
        .replace(`${smoke}\n`, "")
        .replace(/^( +)(echo "deployed)/m, `${smoke.replace("releases/$RELEASE", "current")}\n$1$2`)
        .replace(/^ +printf .*release\.json"\n/m, "")
        .replace("runs-on: [self-hosted, production]", "runs-on: ubuntu-latest")
        .replace(/tags: \["[^"]+"\]/, 'tags: ["v*.*.*"]')
        .replace(/=~ \S+ \]\]/, "=~ ^v ]]"),
    );
    const gh = await compare(join(dir, "ci.yml"));
    printCompare({ ...gh, rows: gh.rows.filter((r) => !r.same) });
    check(!gh.rows.find((r) => r.name === "deploy")!.same && gh.deploys.some((d) => !agree(d)), "the drifted GitHub copy is caught: deploy commands, runner and tag rule differ");

    console.log("   Azure: the coverage flag dropped, the audit always only warns, the tag check step removed, deploy on a hosted agent:");
    const azure = readFileSync("azure-pipelines.yml", "utf8");
    writeFileSync(
      join(dir, "azure-pipelines.yml"),
      azure
        .replace("npx vitest run --coverage", "npx vitest run")
        .replace(/continueOnError: \$\{\{.*\}\}/, "continueOnError: true")
        .replace(/ +- script: \|\n +\[\[ "\$BUILD_SOURCEBRANCHNAME"[^\n]*\n[^\n]*\n[^\n]*\n/, "")
        .replace(/environment:\n +name: production\n +resourceType: VirtualMachine/, "environment: production"),
    );
    const az = await compare(undefined, join(dir, "azure-pipelines.yml"));
    printCompare({ ...az, rows: az.rows.filter((r) => !r.same) });
    check(
      ["unit", "deploy"].every((n) => !az.rows.find((r) => r.name === n)!.same) && az.deploys.some((d) => !agree(d)) && az.audit.some((d) => !agree(d)),
      "the drifted Azure copy is caught: coverage gate, runner, tag rule and audit rule differ",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  step(
    "9. Each file is valid for its platform",
    "a pipeline file that does not parse fails before any job runs, on the server. Each file is parsed as YAML (duplicate keys rejected) and checked against its platform's published JSON schema; one typo per file shows the check can fail",
  );
  for (const p of Object.keys(SCHEMAS) as Platform[]) {
    const r = validate(p);
    console.log(`   ${SCHEMAS[p].file.padEnd(22)} yaml ok, ${SCHEMAS[p].name}${r.version ? ` ${r.version}` : ""}: ${r.errors.length ? `${r.count} error(s), ${r.errors[0]}` : "valid"}`);
    check(r.yaml.length === 0 && r.errors.length === 0, `${SCHEMAS[p].file} is valid`);
  }
  console.log(`   (Azure schema patched: ${AZURE_PATCH})`);
  const typos: [Platform, string, string][] = [
    ["gitlab", "    when: always", "    when: allways"],
    ["gitlab", "  stage: lint\n", "  stage: lint\n  stage: lint\n"],
    ["github", "runs-on: ubuntu-latest", "run-on: ubuntu-latest"],
    ["azure", "    dependsOn: build", "    dependOn: build"],
    ["azure", "inputs: { versionSpec: 22.x }", "inputs: { version: 22.x }"],
  ];
  for (const [p, from, to] of typos) {
    const text = readFileSync(SCHEMAS[p].file, "utf8");
    check(text.includes(from), `${SCHEMAS[p].file} has ${from.trim()}`);
    const r = validate(p, text.replace(from, to));
    console.log(`   ${SCHEMAS[p].file.padEnd(22)} with "${to.trim().replace(/\n\s*/g, "; ")}": ${r.yaml.length ? `yaml error: ${r.yaml[0].replace(/:$/, "")}` : `${r.count} schema error(s), ${r.errors[0]}`}`);
    check(r.yaml.length > 0 || r.errors.length > 0, `the typo in ${SCHEMAS[p].file} is rejected`);
  }
}

await main();
