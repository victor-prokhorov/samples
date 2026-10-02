import { readFile } from "node:fs/promises";
import { parse } from "yaml";

type GitLabJob = { stage?: string; script?: string[]; needs?: string[]; rules?: { if?: string }[] };
type GitHubJob = { needs?: string | string[]; if?: string; steps: { run?: string }[] };

const reserved = new Set(["stages", "workflow", "variables", "default", "include"]);
const commands = (lines: string[]) => lines.flatMap((l) => l.match(/npm run \w+|npx vitest run|cp -r dist|ln -sfn/g) ?? []).join(", ");

export async function compare() {
  const gitlab = parse(await readFile(".gitlab-ci.yml", "utf8")) as Record<string, GitLabJob>;
  const github = parse(await readFile("github-actions/ci.yml", "utf8")) as { jobs: Record<string, GitHubJob> };
  const rows = Object.entries(gitlab)
    .filter(([name]) => !reserved.has(name))
    .map(([name, job]) => {
      const gh = github.jobs[name];
      const gl = commands(job.script ?? []);
      const ghc = gh ? commands(gh.steps.map((s) => s.run ?? "")) : "(missing)";
      return { name, stage: job.stage ?? "", gl, needs: [gh?.needs ?? []].flat().join(", "), gh: ghc, same: gl === ghc };
    });
  return { rows, gitlabDeploy: JSON.stringify(gitlab.deploy.rules), githubDeploy: github.jobs.deploy.if ?? "" };
}

if (process.argv[1]?.endsWith("compare.ts")) {
  const { rows } = await compare();
  for (const r of rows) console.log(`${r.name.padEnd(10)} ${r.same ? "same" : "DIFFERENT"}  gitlab: ${r.gl}  github: ${r.gh}`);
}
