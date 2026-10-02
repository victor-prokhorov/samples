import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { blocks, docs } from "./extract.js";

export type Requirement = { id: string; title: string; criteria: string[]; allJourneys: boolean };
export type JourneyStep = { id: string; text: string; reqs: string[] };

async function text(files: string[], prefix: string) {
  const file = files.find((f) => f.split("/").pop()!.startsWith(prefix));
  if (!file) throw new Error(`no ${prefix}-*.md`);
  return readFile(file, "utf8");
}

export function requirements(md: string): Requirement[] {
  return md.split(/^### /m).slice(1).flatMap((chunk) => {
    const head = /^(REQ-\d+) (.+)$/m.exec(chunk);
    if (!head) return [];
    return [{ id: head[1], title: head[2], criteria: [...chunk.matchAll(/^- AC\d+: (.+)$/gm)].map((m) => m[1]), allJourneys: /Applies to: all journeys/.test(chunk) }];
  });
}

export function journeys(md: string): JourneyStep[] {
  return [...md.matchAll(/^\| (J\d+\.\d+) \|(.+?)\|(.*?)\|$/gm)].map((m) => ({ id: m[1], text: m[2].trim(), reqs: m[3].match(/REQ-\d+/g) ?? [] }));
}

const gwt = (c: string) => /\bGiven\b/i.test(c) && /\bwhen\b/i.test(c) && /\bthen\b/i.test(c);

export async function trace(files: string[]) {
  const reqs = requirements(await text(files, "03"));
  const steps = journeys(await text(files, "02"));
  const all = await blocks(files);
  const problems: string[] = [];
  const ids = new Set(reqs.map((r) => r.id));

  for (const r of reqs) {
    if (!r.criteria.length) problems.push(`${r.id} has no acceptance criteria`);
    for (const c of r.criteria.filter((c) => !gwt(c))) problems.push(`${r.id} criterion is not Given/When/Then: "${c}"`);
  }
  for (const s of steps) {
    if (!s.reqs.length) problems.push(`${s.id} maps to no requirement`);
    for (const id of s.reqs.filter((id) => !ids.has(id))) problems.push(`${s.id} refers to ${id}, which does not exist`);
  }
  const coverage = reqs.map((r) => ({ ...r, steps: steps.filter((s) => s.reqs.includes(r.id)).map((s) => s.id) }));
  for (const r of coverage.filter((r) => !r.steps.length && !r.allJourneys)) problems.push(`${r.id} is used by no journey step`);

  // the ER diagram and the DDL must name the same tables
  const er = all.find((b) => b.marker === "diagram: er-model")?.code ?? "";
  const ddl = all.find((b) => b.marker === "sql: ddl")?.code ?? "";
  const entities = new Set([...er.matchAll(/^\s+(\w+) (?:\|\||\}o|\|o|\}\|)/gm), ...er.matchAll(/^\s+(\w+) \{$/gm)].map((m) => m[1]));
  const tables = new Set([...ddl.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1]));
  for (const e of entities) if (!tables.has(e)) problems.push(`ER entity ${e} has no CREATE TABLE`);
  for (const t of tables) if (!entities.has(t)) problems.push(`table ${t} is missing from the ER diagram`);

  // the state machine and the status CHECK must allow the same states
  const sm = all.find((b) => b.marker === "diagram: state-change-request")?.code ?? "";
  const states = new Set([...sm.matchAll(/(\w+) --> (\w+)/g)].flatMap((m) => [m[1], m[2]]));
  const check = /CREATE TABLE change_requests[\s\S]*?status text[^\n]*\n?\s*CHECK \(status IN \(([^)]*)\)\)/.exec(ddl)?.[1] ?? "";
  const allowed = new Set([...check.matchAll(/'(\w+)'/g)].map((m) => m[1]));
  for (const s of states) if (!allowed.has(s)) problems.push(`state ${s} is not allowed by the status CHECK`);
  for (const s of allowed) if (!states.has(s)) problems.push(`status '${s}' is not a state in the lifecycle diagram`);

  // every journey query belongs to a journey step
  const stepIds = new Set(steps.map((s) => s.id));
  for (const q of all.filter((b) => /^sql: J/.test(b.marker))) {
    const id = q.marker.split(" ")[1];
    if (!stepIds.has(id)) problems.push(`query ${id} (${q.file}:${q.line}) belongs to no journey step`);
  }
  return { reqs: coverage, steps, entities: [...entities], tables: [...tables], states: [...states], allowed: [...allowed], problems };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t = await trace(await docs());
  for (const r of t.reqs) console.log(`   ${r.id} ${r.title.padEnd(44)} ${r.criteria.length} AC  ${r.allJourneys ? "all journeys" : r.steps.join(" ")}`);
  for (const p of t.problems) console.log(`   PROBLEM ${p}`);
  process.exitCode = t.problems.length ? 1 : 0;
}
