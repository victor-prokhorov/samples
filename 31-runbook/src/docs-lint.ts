// usage: docs-lint.ts [root]; checks root/runbooks/*.md, root/docs/adr/*.md and root/docs/onboarding.md
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { REQUIRED, parse } from "./parse.js";

const STATUSES = /^(Proposed|Accepted|Rejected|Deprecated|Superseded by \[[^\]]+\]\(([^)]+)\))$/;

const md = async (dir: string) => (existsSync(dir) ? (await readdir(dir)).filter((f) => f.endsWith(".md")).sort().map((f) => join(dir, f)) : []);

function links(file: string, text: string) {
  return [...text.matchAll(/\]\(([^)#\s]+)\)/g)]
    .map((m) => m[1])
    .filter((target) => !/^[a-z]+:/.test(target) && !existsSync(join(dirname(file), target)))
    .map((target) => `broken link ${target}`);
}

async function runbook(file: string) {
  const problems: string[] = [];
  const doc = await parse(file);
  if (!doc.title) problems.push("no '# title'");
  if (!doc.meta.Owner) problems.push("no 'Owner:' line");
  if (!doc.meta.Parameters) problems.push("no 'Parameters:' line (write 'Parameters: none')");
  const names = doc.sections.map((s) => s.name);
  for (const name of REQUIRED) {
    const section = doc.sections.find((s) => s.name === name);
    if (!section) problems.push(`no '## ${name}' section`);
    else if (!section.steps.length) problems.push(`'## ${name}' has no '### step'`);
    for (const b of section?.loose ?? []) problems.push(`'## ${name}' has a ${b.lang || "plain"} block outside any '### step' (it never runs)`);
    for (const step of section?.steps ?? []) {
      if (!step.blocks.some((b) => b.lang === "sh" || b.lang === "manual")) problems.push(`'${name} / ${step.title}' has no sh or manual block`);
      for (const b of step.blocks) if (b.lang !== "sh" && b.lang !== "manual") problems.push(`'${name} / ${step.title}' has a block in '${b.lang}' (use sh or manual)`);
    }
  }
  const order = names.filter((n) => REQUIRED.includes(n));
  if (order.join() !== REQUIRED.filter((n) => names.includes(n)).join()) problems.push(`sections out of order: ${order.join(", ")}`);
  return [...problems, ...links(file, await readFile(file, "utf8"))];
}

async function adr(file: string) {
  const problems: string[] = [];
  const text = await readFile(file, "utf8");
  const number = /^(\d{4})-[a-z0-9-]+\.md$/.exec(basename(file))?.[1];
  if (!number) problems.push("file name is not NNNN-title.md");
  const title = /^# (\d+)\. .+/m.exec(text);
  if (!title) problems.push("no '# N. Title' heading");
  else if (number && Number(title[1]) !== Number(number)) problems.push(`heading number ${title[1]} does not match file ${number}`);
  if (!/^Date: \d{4}-\d{2}-\d{2}$/m.test(text)) problems.push("no 'Date: YYYY-MM-DD' line");
  const sections = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  for (const s of ["Status", "Context", "Decision", "Consequences"]) if (!sections.includes(s)) problems.push(`no '## ${s}' section`);
  const status = /^## Status\s*\n+(.+)$/m.exec(text)?.[1].trim();
  if (sections.includes("Status") && !STATUSES.test(status ?? "")) problems.push(`status '${status}' is not Proposed, Accepted, Rejected, Deprecated or Superseded by [N](file)`);
  return [...problems, ...links(file, text)];
}

async function checklist(file: string) {
  const text = await readFile(file, "utf8");
  const problems = /^- \[ \] /m.test(text) ? [] : ["no '- [ ]' checklist items"];
  return [...problems, ...links(file, text)];
}

export async function lint(root: string) {
  const results: { file: string; problems: string[] }[] = [];
  for (const f of await md(join(root, "runbooks"))) results.push({ file: f, problems: await runbook(f) });
  for (const f of await md(join(root, "docs/adr"))) results.push({ file: f, problems: await adr(f) });
  const onboarding = join(root, "docs/onboarding.md");
  if (existsSync(onboarding)) results.push({ file: onboarding, problems: await checklist(onboarding) });
  else results.push({ file: onboarding, problems: ["missing: every team needs an onboarding checklist"] });
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = await lint(process.argv[2] ?? ".");
  for (const r of results) for (const p of r.problems.length ? r.problems : ["ok"]) console.log(`   ${r.file}: ${p}`);
  const count = results.reduce((n, r) => n + r.problems.length, 0);
  console.log(`   docs-lint: ${results.length} files, ${count} problem(s)`);
  process.exitCode = count ? 1 : 0;
}
