import { readFile } from "node:fs/promises";
import { parse } from "yaml";

type GitLabRule = { if?: string; allow_failure?: boolean };
type GitLabJob = { stage?: string; script?: string[]; needs?: string[]; tags?: string[]; rules?: GitLabRule[] };
type GitHubStep = { if?: string; run?: string };
type GitHubJob = { needs?: string | string[]; if?: string; "runs-on": string | string[]; "continue-on-error"?: string | boolean; steps: GitHubStep[] };
type GitHub = { on: { push?: { branches?: string[]; tags?: string[] }; schedule?: unknown[] }; jobs: Record<string, GitHubJob> };
type AzureStep = { script?: string; condition?: string };
type AzurePool = { vmImage?: string; name?: string };
type AzureJob = {
  job?: string;
  deployment?: string;
  pool?: AzurePool;
  condition?: string;
  continueOnError?: string | boolean;
  environment?: string | { name: string; resourceType?: string };
  steps?: AzureStep[];
  strategy?: { runOnce?: { deploy?: { steps: AzureStep[] } } };
};
type AzureStage = { stage: string; dependsOn?: string | string[]; condition?: string; pool?: AzurePool; jobs: AzureJob[] };
type Azure = { trigger?: { branches?: { include?: string[] }; tags?: { include?: string[] } }; schedules?: unknown[]; pool?: AzurePool; stages: AzureStage[] };
export type Trigger = { label: string; source: "schedule" | "push"; tag?: string; branch?: string };

const reserved = new Set(["stages", "workflow", "variables", "default", "include"]);

// The commands that matter, in order. Shell variables ($DEPLOY_DIR, $RELEASE) are written the same way in all files, so the
// text is compared as is; CI variables differ by platform and are left out (release.json is compared by its path).
// `npx vitest run --coverage` keeps its flag: a pipeline that drops it has dropped the coverage gate.
const COMMAND = /npm run \w+|npx vitest run(?: --coverage)?|mkdir -p \S+|cp -r dist\S* \S+|\S+\/package\.json"|\S+\/release\.json"|import\('[^']+'\)|ln -sfn \S+ \S+|mv -T \S+ \S+/g;
const commands = (lines: string[]) => lines.flatMap((l) => l.split("\n")).flatMap((l) => l.match(COMMAND) ?? []);
const label = (c: string) =>
  c.startsWith("mkdir") ? "mkdir"
  : c.startsWith("cp ") ? "cp dist"
  : c.endsWith('package.json"') ? "package.json"
  : c.endsWith('release.json"') ? "release.json"
  : c.startsWith("import(") ? `smoke ${c.replace(/^import\('\$DEPLOY_DIR\/|\/page\.js'\)$/g, "")}`
  : c.startsWith("ln ") ? "ln -sfn"
  : c.startsWith("mv ") ? "mv -T"
  : c;

// Which machine a job needs: GitLab runner tags, GitHub runs-on labels (a GitHub-hosted image or self-hosted alone means "any"),
// Azure: a deployment job to an environment's VirtualMachine resource runs on that machine; a Microsoft-hosted vmImage means "any".
const gitlabRunner = (job: GitLabJob) => (job.tags ?? []).join(", ") || "any";
const githubRunner = (job: GitHubJob) => [job["runs-on"]].flat().filter((l) => l !== "self-hosted" && !/-latest$/.test(l)).join(", ") || "any";
function azureRunner(az: Azure, stage: AzureStage, job: AzureJob) {
  const env = job.environment;
  if (typeof env === "object" && env.resourceType === "VirtualMachine") return env.name;
  const pool = job.pool ?? stage.pool ?? az.pool;
  return pool?.name ?? "any";
}

// GitLab rule conditions this file uses: $VAR == "x", $VAR =~ /re/, a bare $VAR (set and not empty), joined with ||.
function gitlabCondition(cond: string, vars: Record<string, string | undefined>): boolean {
  return cond.split("||").some((part) => {
    const c = part.trim();
    const eq = /^\$(\w+) == "([^"]*)"$/.exec(c);
    if (eq) return vars[eq[1]] === eq[2];
    const re = /^\$(\w+) =~ \/(.+)\/$/.exec(c);
    if (re) return vars[re[1]] !== undefined && new RegExp(re[2]).test(vars[re[1]]!);
    const set = /^\$(\w+)$/.exec(c);
    if (set) return !!vars[set[1]];
    throw new Error(`compare.ts does not understand the GitLab rule ${c}`);
  });
}
const gitlabVars = (t: Trigger) => ({ CI_PIPELINE_SOURCE: t.source, CI_COMMIT_TAG: t.tag, CI_COMMIT_BRANCH: t.branch });
// the first rule that matches wins; no rule matching means the job is not in the pipeline
const gitlabRule = (job: GitLabJob, t: Trigger) => (job.rules ?? [{}]).find((r) => r.if === undefined || gitlabCondition(r.if, gitlabVars(t)));
const gitlabDeploys = (gl: Record<string, GitLabJob>, t: Trigger) => !!gitlabRule(gl.deploy, t);
const gitlabAuditBlocks = (gl: Record<string, GitLabJob>, t: Trigger) => gitlabRule(gl.audit, t)?.allow_failure === false;

// GitHub filter patterns: * is any run of characters except /, + repeats the previous character, . and the rest are literal
const filter = (pattern: string) => new RegExp(`^${pattern.replace(/\./g, "\\.").replace(/\*/g, "[^/]*")}$`);
const ref = (t: Trigger) => (t.tag ? `refs/tags/${t.tag}` : `refs/heads/${t.branch ?? "main"}`);

// GitHub expressions this file uses: github.event_name ==/!= 'x', [!]startsWith(github.ref, 'x'), joined with || or &&.
function githubCondition(expr: string, t: Trigger): boolean {
  const e = expr.replace(/^\$\{\{\s*|\s*\}\}$/g, "").trim();
  const atom = (c: string): boolean => {
    const neg = c.startsWith("!");
    const s = neg ? c.slice(1) : c;
    const name = /^github\.event_name (==|!=) '(\w+)'$/.exec(s);
    const prefix = /^startsWith\(github\.ref, '([^']+)'\)$/.exec(s);
    const v = name ? (name[1] === "==") === (t.source === name[2]) : prefix ? ref(t).startsWith(prefix[1]) : undefined;
    if (v === undefined) throw new Error(`compare.ts does not understand the GitHub condition ${c}`);
    return neg ? !v : v;
  };
  return e.split("||").some((or) => or.split("&&").every((and) => atom(and.trim())));
}

function githubDeploys(gh: GitHub, t: Trigger) {
  const triggered = t.source === "schedule" ? !!gh.on.schedule : t.tag ? (gh.on.push?.tags ?? []).some((p) => filter(p).test(t.tag!)) : (gh.on.push?.branches ?? []).includes(t.branch!);
  const job = gh.jobs.deploy;
  if (!triggered || !githubCondition(job.if ?? "true", t)) return false;
  // a step that checks the tag against a regex and fails the job before anything is written
  const guard = job.steps.find((s) => s.if === "github.ref_type == 'tag'" && /=~ \S+ \]\]/.test(s.run ?? ""));
  if (t.tag && guard) return new RegExp(/=~ (\S+) \]\]/.exec(guard.run!)![1]).test(t.tag);
  return true;
}
const githubAuditBlocks = (gh: GitHub, t: Trigger) => {
  const c = gh.jobs.audit["continue-on-error"];
  return !(typeof c === "string" ? githubCondition(c, t) : !!c);
};

// Azure Pipelines expressions: functions and(), or(), not(), eq(), ne(), startsWith(), succeeded(), variables['X'] and 'strings'.
// String comparisons are case-insensitive, as on the server. ${{ }} (template) and plain (runtime) conditions use the same functions.
export function azureCondition(expr: string, vars: Record<string, string>): boolean {
  const src = expr.replace(/^\$\{\{\s*|\s*\}\}$/g, "").trim();
  let i = 0;
  const ws = () => {
    while (/\s/.test(src[i] ?? "")) i++;
  };
  const value = (): string | boolean => {
    ws();
    if (src[i] === "'") {
      const end = src.indexOf("'", i + 1);
      const s = src.slice(i + 1, end);
      i = end + 1;
      return s;
    }
    const name = /^[A-Za-z]+/.exec(src.slice(i))?.[0];
    if (!name) throw new Error(`compare.ts cannot read the Azure expression ${src} at ${i}`);
    i += name.length;
    if (name === "true" || name === "false") return name === "true";
    if (name === "variables") {
      const v = /^\['([^']+)'\]/.exec(src.slice(i))!;
      i += v[0].length;
      return vars[v[1]] ?? "";
    }
    ws();
    if (src[i++] !== "(") throw new Error(`compare.ts expected ( after ${name} in ${src}`);
    const args: (string | boolean)[] = [];
    ws();
    while (src[i] !== ")") {
      args.push(value());
      ws();
      if (src[i] === ",") i++;
      ws();
    }
    i++;
    const s = (x: string | boolean) => String(x).toLowerCase();
    switch (name) {
      case "and": return args.every((a) => a === true);
      case "or": return args.some((a) => a === true);
      case "not": return args[0] !== true;
      case "eq": return s(args[0]) === s(args[1]);
      case "ne": return s(args[0]) !== s(args[1]);
      case "startsWith": return s(args[0]).startsWith(s(args[1]));
      case "succeeded": return true; // the earlier stages passed: that is the case being compared
      default: throw new Error(`compare.ts does not know the Azure function ${name}`);
    }
  };
  const result = value();
  return result === true || (typeof result === "string" && result.toLowerCase() === "true");
}
// Wildcards in Azure trigger filters: * is any run of characters.
const wildcard = (pattern: string) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
const azureVars = (t: Trigger) => ({ "Build.Reason": t.source === "schedule" ? "Schedule" : "IndividualCI", "Build.SourceBranch": ref(t) });
const azureSteps = (job: AzureJob) => job.steps ?? job.strategy?.runOnce?.deploy?.steps ?? [];
const azureJobs = (az: Azure) => az.stages.flatMap((stage, n) => stage.jobs.map((job) => ({ stage, job, name: job.job ?? job.deployment!, after: [stage.dependsOn ?? az.stages[n - 1]?.stage ?? []].flat() })));

function azureDeploys(az: Azure, t: Trigger) {
  const triggered = t.source === "schedule" ? !!az.schedules?.length : t.tag ? (az.trigger?.tags?.include ?? []).some((p) => wildcard(p).test(t.tag!)) : (az.trigger?.branches?.include ?? []).includes(t.branch!);
  const deploy = azureJobs(az).find((j) => j.name === "deploy");
  if (!triggered || !deploy) return false;
  const vars = azureVars(t);
  if (!azureCondition(deploy.stage.condition ?? "succeeded()", vars) || !azureCondition(deploy.job.condition ?? "succeeded()", vars)) return false;
  const guard = azureSteps(deploy.job).find((s) => /refs\/tags\//.test(s.condition ?? "") && /=~ \S+ \]\]/.test(s.script ?? ""));
  if (t.tag && guard && azureCondition(guard.condition!, vars)) return new RegExp(/=~ (\S+) \]\]/.exec(guard.script!)![1]).test(t.tag);
  return true;
}
const azureAuditBlocks = (az: Azure, t: Trigger) => {
  const c = azureJobs(az).find((j) => j.name === "audit")!.job.continueOnError;
  return !(typeof c === "string" ? azureCondition(c, azureVars(t)) : !!c);
};

export const triggers: Trigger[] = [
  { label: "schedule", source: "schedule" },
  { label: "push main", source: "push", branch: "main" },
  { label: "tag v1.4.0", source: "push", tag: "v1.4.0" },
  { label: "tag v1.4.0-rc1", source: "push", tag: "v1.4.0-rc1" },
  { label: "tag v1.4", source: "push", tag: "v1.4" },
  { label: "tag rc-1", source: "push", tag: "rc-1" },
];
// the audit is compared where all three run a pipeline (the GitHub and Azure tag filters do not start one for rc-1 or v1.4)
const auditTriggers = triggers.slice(0, 3);

export async function compare(githubFile = "github-actions/ci.yml", azureFile = "azure-pipelines.yml") {
  const gitlab = parse(await readFile(".gitlab-ci.yml", "utf8")) as Record<string, GitLabJob>;
  const github = parse(await readFile(githubFile, "utf8")) as GitHub;
  const azure = parse(await readFile(azureFile, "utf8")) as Azure;
  const az = azureJobs(azure);
  const rows = Object.entries(gitlab)
    .filter(([name]) => !reserved.has(name))
    .map(([name, job]) => {
      const gh = github.jobs[name];
      const a = az.find((j) => j.name === name);
      const gl = commands(job.script ?? []);
      const ghc = gh ? commands(gh.steps.map((s) => s.run ?? "")) : ["(missing)"];
      const azc = a ? commands(azureSteps(a.job).map((s) => s.script ?? "")) : ["(missing)"];
      const runner = { gitlab: gitlabRunner(job), github: gh ? githubRunner(gh) : "(missing)", azure: a ? azureRunner(azure, a.stage, a.job) : "(missing)" };
      return {
        name,
        stage: job.stage ?? "",
        needs: [gh?.needs ?? []].flat().join(", "),
        azure: a ? `${a.stage.stage}${a.after.length ? ` (${a.after.join(", ")})` : ""}` : "(missing)",
        gl: gl.map(label).join(", "),
        gh: ghc.map(label).join(", "),
        az: azc.map(label).join(", "),
        runner,
        same: gl.join("\n") === ghc.join("\n") && gl.join("\n") === azc.join("\n") && runner.gitlab === runner.github && runner.gitlab === runner.azure,
      };
    });
  const deploys = triggers.map((t) => ({ trigger: t.label, gitlab: gitlabDeploys(gitlab, t), github: githubDeploys(github, t), azure: azureDeploys(azure, t) }));
  const audit = auditTriggers.map((t) => ({ trigger: t.label, gitlab: gitlabAuditBlocks(gitlab, t), github: githubAuditBlocks(github, t), azure: azureAuditBlocks(azure, t) }));
  return { rows, deploys, audit };
}

if (process.argv[1]?.endsWith("compare.ts")) {
  const { rows, deploys, audit } = await compare(process.argv[2], process.argv[3]);
  for (const r of rows) console.log(`${r.name.padEnd(10)} ${r.same ? "same" : "DIFFERENT"}  runner ${r.runner.gitlab}/${r.runner.github}/${r.runner.azure}  gitlab: ${r.gl}  github: ${r.gh}  azure: ${r.az}`);
  for (const d of deploys) console.log(`${d.trigger.padEnd(15)} deploy gitlab ${d.gitlab}, github ${d.github}, azure ${d.azure}`);
  for (const d of audit) console.log(`${d.trigger.padEnd(15)} audit blocks gitlab ${d.gitlab}, github ${d.github}, azure ${d.azure}`);
}
