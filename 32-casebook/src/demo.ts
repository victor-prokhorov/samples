import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import pg from "pg";
import { blocks, docs } from "./extract.js";
import { render } from "./render.js";
import { cell, schema, url } from "./schema.js";
import { trace } from "./trace.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

async function main() {
  const real = await docs();
  const draftNames = ["02", "03", "04", "05", "06"];
  const draft = real.map((f) => (draftNames.includes(basename(f).slice(0, 2)) ? `fixtures/draft/${basename(f)}` : f));

  step("1. A draft that reads well but does not hold together", "traceability: every requirement has Given/When/Then criteria and is used by a journey step, every step names requirements that exist, the ER diagram and the DDL list the same tables, the lifecycle diagram and the status CHECK the same states");
  const t0 = await trace(draft);
  for (const p of t0.problems) console.log(`   PROBLEM ${p}`);
  check(t0.problems.length === 7, "the draft has 7 traceability problems");

  step("2. A diagram that does not parse", "diagrams are code: mermaid-cli renders each block in headless Chromium, so a syntax error fails the check instead of showing up as a blank box in a review");
  const r0 = await render(["fixtures/draft/04-architecture.md"], "build/draft");
  for (const r of r0) console.log(`   ${r.source.padEnd(42)} ${r.error ? `FAILED ${r.error}` : "ok"}`);
  check(r0.filter((r) => r.error).length === 1, "one draft diagram fails to render");

  step("3. A data model that lets one person approve twice", "the journeys' queries run against the DDL; J4.3 expects the database to refuse a second approval by the first approver, and the draft has no four_eyes constraint");
  const admin = new pg.Client({ connectionString: url() });
  await admin.connect();
  await admin.query("DROP DATABASE IF EXISTS draft");
  await admin.query("CREATE DATABASE draft");
  await admin.end();
  const s0 = await schema(draft, "draft");
  for (const r of s0.results.filter((r) => !r.ok)) console.log(`   ${r.step} expected ${r.expect}, got ${r.error ?? `${r.rows.length} row(s)`}`);
  check(s0.results.filter((r) => !r.ok).map((r) => r.step).join() === "J4.3", "only J4.3 fails on the draft");

  step("4. The casebook: every requirement traced", "the matrix requirement -> acceptance criteria -> journey steps; cross-cutting requirements (accessibility, languages, reliability, data protection) apply to all journeys");
  const t = await trace(real);
  for (const r of t.reqs) console.log(`   ${r.id} ${r.title.padEnd(44)} ${String(r.criteria.length).padStart(2)} AC  ${r.allJourneys ? "all journeys" : r.steps.join(" ")}`);
  console.log(`   ${t.steps.length} journey steps, each mapped; ER entities = tables: ${t.tables.length}; lifecycle states = status CHECK values: ${t.allowed.join(", ")}`);
  check(t.problems.length === 0 && t.allowed.length === 7 && t.tables.length === 10, "no traceability problem");

  step("5. Render every diagram to SVG", "mermaid-cli with puppeteer pointed at the preinstalled Chromium (puppeteer.json); the SVGs are committed in diagrams/ for readers whose viewer does not render Mermaid");
  const rendered = await render(real);
  for (const r of rendered) console.log(`   ${r.source.padEnd(42)} -> ${r.svg.padEnd(40)} ${r.error ? `FAILED ${r.error}` : `${r.kind}, ${r.bytes} bytes`}`);
  check(rendered.length === 9 && rendered.every((r) => !r.error), "9 diagrams rendered");

  step("6. Apply the data model and run the queries the journeys need", "DDL and seed from 05-data-model.md into an empty Postgres, then each journey step's query in order on one connection; the expected row count, or an error where the database must refuse");
  const s = await schema(real);
  console.log(`   ${s.tables} tables created`);
  for (const r of s.results) {
    const first = r.error ?? (r.rows[0] ? Object.entries(r.rows[0]).map(([k, v]) => `${k}=${cell(v)}`).join(" ") : "");
    console.log(`   ${r.step} expect ${r.expect.padEnd(5)} ${r.ok ? "ok" : "MISMATCH"}  ${r.error ? "" : `${r.rows.length} row(s), first: `}${first}`);
  }
  check(s.results.length === 12 && s.results.every((r) => r.ok), "every journey query behaves as expected");

  step("7. The deliverables", "what three hours produced: eleven documents, the diagrams and SQL inside them, all checked by the steps above");
  const all = await blocks(real);
  for (const f of real) {
    const words = (await readFile(f, "utf8")).split(/\s+/).filter(Boolean).length;
    const mine = all.filter((b) => b.file === f);
    console.log(`   ${f.padEnd(42)} ${String(words).padStart(5)} words  ${mine.filter((b) => b.lang === "mermaid").length} diagram(s)  ${mine.filter((b) => b.lang === "sql").length} SQL block(s)`);
  }
}

await main();
