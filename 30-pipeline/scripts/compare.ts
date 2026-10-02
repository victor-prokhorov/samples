import { readFile } from "node:fs/promises";
import { parse } from "yaml";

type GitLabJob = { stage?: string; script?: string[]; needs?: string[]; tags?: string[]; rules?: { if?: string }[] };
type GitHubStep = { if?: string; run?: string };
type GitHubJob = { needs?: string | string[]; if?: string; "runs-on": string | string[]; steps: GitHubStep[] };
type GitHub = { on: { push?: { branches?: string[]; tags?: string[] }; schedule?: unknown[] }; jobs: Record<string, GitHubJob> };
export type Trigger = { label: string; source: "schedule" | "push"; tag?: string; branch?: string };

const reserved = new Set(["stages", "workflow", "variables", "default", "include"]);

// The commands that matter, in order. Shell variables ($DEPLOY_DIR, $RELEASE) are written the same way in both files, so the
// text is compared as is; CI variables differ by platform and are left out (release.json is compared by its path).
const COMMAND = /npm run \w+|npx vitest run|mkdir -p \S+|cp -r dist\S* \S+|\S+\/package\.json"|\S+\/release\.json"|import\('[^']+'\)|ln -sfn \S+ \S+|mv -T \S+ \S+/g;
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

// Which machine a job needs: GitLab runner tags versus GitHub runs-on labels (a GitHub-hosted image or self-hosted alone means "any").
const gitlabRunner = (job: GitLabJob) => (job.tags ?? []).join(", ") || "any";
const githubRunner = (job: GitHubJob) => [job["runs-on"]].flat().filter((l) => l !== "self-hosted" && !/-latest$/.test(l)).join(", ") || "any";

function gitlabDeploys(job: GitLabJob, t: Trigger) {
  return (job.rules ?? []).some(({ if: cond = "" }) => {
    const source = /^\$CI_PIPELINE_SOURCE == "(\w+)"$/.exec(cond);
    if (source) return t.source === source[1];
    const tag = /^\$CI_COMMIT_TAG =~ \/(.+)\/$/.exec(cond);
    if (tag) return t.tag !== undefined && new RegExp(tag[1]).test(t.tag);
    throw new Error(`compare.ts does not understand the GitLab rule ${cond}`);
  });
}

// GitHub filter patterns: * is any run of characters except /, + repeats the previous character, . and the rest are literal
const filter = (pattern: string) => new RegExp(`^${pattern.replace(/\./g, "\\.").replace(/\*/g, "[^/]*")}$`);

function githubDeploys(gh: GitHub, t: Trigger) {
  const ref = t.tag ? `refs/tags/${t.tag}` : `refs/heads/${t.branch ?? "main"}`;
  const event = t.source;
  const triggered = event === "schedule" ? !!gh.on.schedule : t.tag ? (gh.on.push?.tags ?? []).some((p) => filter(p).test(t.tag!)) : (gh.on.push?.branches ?? []).includes(t.branch!);
  if (!triggered) return false;
  const job = gh.jobs.deploy;
  const runs = (job.if ?? "true").split("||").some((part) => {
    const c = part.trim();
    const name = /^github\.event_name == '(\w+)'$/.exec(c);
    if (name) return event === name[1];
    const prefix = /^startsWith\(github\.ref, '([^']+)'\)$/.exec(c);
    if (prefix) return ref.startsWith(prefix[1]);
    throw new Error(`compare.ts does not understand the GitHub condition ${c}`);
  });
  if (!runs) return false;
  // a step that checks the tag against a regex and fails the job before anything is written
  const guard = job.steps.find((s) => s.if === "github.ref_type == 'tag'" && /=~ \S+ \]\]/.test(s.run ?? ""));
  if (t.tag && guard) return new RegExp(/=~ (\S+) \]\]/.exec(guard.run!)![1]).test(t.tag);
  return true;
}

export const triggers: Trigger[] = [
  { label: "schedule", source: "schedule" },
  { label: "push main", source: "push", branch: "main" },
  { label: "tag v1.4.0", source: "push", tag: "v1.4.0" },
  { label: "tag v1.4.0-rc1", source: "push", tag: "v1.4.0-rc1" },
  { label: "tag v1.4", source: "push", tag: "v1.4" },
  { label: "tag rc-1", source: "push", tag: "rc-1" },
];

export async function compare(githubFile = "github-actions/ci.yml") {
  const gitlab = parse(await readFile(".gitlab-ci.yml", "utf8")) as Record<string, GitLabJob>;
  const github = parse(await readFile(githubFile, "utf8")) as GitHub;
  const rows = Object.entries(gitlab)
    .filter(([name]) => !reserved.has(name))
    .map(([name, job]) => {
      const gh = github.jobs[name];
      const gl = commands(job.script ?? []);
      const ghc = gh ? commands(gh.steps.map((s) => s.run ?? "")) : ["(missing)"];
      const runner = { gitlab: gitlabRunner(job), github: gh ? githubRunner(gh) : "(missing)" };
      return {
        name,
        stage: job.stage ?? "",
        needs: [gh?.needs ?? []].flat().join(", "),
        gl: gl.map(label).join(", "),
        gh: ghc.map(label).join(", "),
        runner,
        same: gl.join("\n") === ghc.join("\n") && runner.gitlab === runner.github,
      };
    });
  const deploys = triggers.map((t) => ({ trigger: t.label, gitlab: gitlabDeploys(gitlab.deploy, t), github: githubDeploys(github, t) }));
  return { rows, deploys };
}

if (process.argv[1]?.endsWith("compare.ts")) {
  const { rows, deploys } = await compare(process.argv[2]);
  for (const r of rows) console.log(`${r.name.padEnd(10)} ${r.same ? "same" : "DIFFERENT"}  runner ${r.runner.gitlab}/${r.runner.github}  gitlab: ${r.gl}  github: ${r.gh}`);
  for (const d of deploys) console.log(`${d.trigger.padEnd(15)} deploy gitlab ${d.gitlab}, github ${d.github}`);
}
