// usage: runner.ts <runbook.md> [--set KEY=value]... [--operator name] [--yes] [--rollback auto] [--parent run-id]
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { createInterface } from "node:readline/promises";
import { db } from "./db.js";
import { type Section, type Step, REQUIRED, params, parse } from "./parse.js";

const args = process.argv.slice(2);
const opt = (name: string) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const file = args[0];
const vars = Object.fromEntries(opt("--set").map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)]));
const operator = opt("--operator")[0] ?? process.env.USER ?? "unknown";
const autoConfirm = args.includes("--yes");
const autoRollback = opt("--rollback")[0] === "auto";
const parent = opt("--parent")[0] ? Number(opt("--parent")[0]) : null;

const doc = await parse(file);
const missing = params(doc).filter((p) => !(p in vars));
if (missing.length) throw new Error(`${file} needs ${missing.map((p) => `--set ${p}=...`).join(" ")}`);
const missingSections = REQUIRED.filter((s) => !doc.sections.some((x) => x.name === s));
if (missingSections.length) throw new Error(`${file} has no ${missingSections.join(", ")} section: run docs-lint`);

await db.query(`
  CREATE SCHEMA IF NOT EXISTS ops;
  CREATE TABLE IF NOT EXISTS ops.runs (id serial PRIMARY KEY, runbook text NOT NULL, params jsonb NOT NULL, operator text NOT NULL, parent int REFERENCES ops.runs,
    started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, outcome text);
  CREATE TABLE IF NOT EXISTS ops.steps (id serial PRIMARY KEY, run_id int NOT NULL REFERENCES ops.runs, section text NOT NULL, step text NOT NULL,
    status text NOT NULL, exit_code int, seconds numeric(6, 2), output text)`);
const run = (await db.query("INSERT INTO ops.runs (runbook, params, operator, parent) VALUES ($1, $2, $3, $4) RETURNING id", [file, vars, operator, parent])).rows[0].id as number;
const env = { ...process.env, ...vars, RUNBOOK_OPERATOR: operator, RUNBOOK_RUN_ID: String(run), PATH: `${process.cwd()}/node_modules/.bin:${process.env.PATH}` };

const say = (s: string) => console.log(s);
say(`runbook #${run}: ${doc.title} (${file})${Object.keys(vars).length ? ` ${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(" ")}` : ""}, operator ${operator}`);

function sh(code: string): Promise<{ exit: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-euo", "pipefail", "-c", code], { env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const relay = (chunk: Buffer) => {
      output += chunk;
      for (const line of chunk.toString().split("\n").filter(Boolean)) say(`      | ${line}`);
    };
    child.stdout.on("data", relay);
    child.stderr.on("data", relay);
    child.on("close", (exit) => resolve({ exit: exit ?? 1, output }));
  });
}

async function confirm(step: Step, instruction: string) {
  say(`      | MANUAL: ${instruction.trim()}`);
  if (autoConfirm) return { ok: true, note: `confirmed by ${operator} (--yes)` };
  if (!process.stdin.isTTY) return { ok: false, note: "needs an operator: rerun with --yes once done, or from a terminal" };
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`      done "${step.title}"? [y/N] `);
  rl.close();
  return { ok: /^y/i.test(answer), note: `answered ${answer || "no"} by ${operator}` };
}

// Runs every step of a section in order and stops at the first failure.
async function runSection(section: Section): Promise<string | null> {
  say(`  ${section.name.toLowerCase()}`);
  for (const step of section.steps) {
    say(`    ${step.title}`);
    const started = performance.now();
    let status = "ok";
    let exit: number | null = 0;
    let output = "";
    for (const block of step.blocks) {
      if (block.lang === "manual") {
        const c = await confirm(step, block.code);
        output += c.note;
        if (!c.ok) [status, exit] = ["not confirmed", null];
      } else if (block.lang === "sh") {
        const r = await sh(block.code);
        output += r.output;
        if (r.exit !== 0) [status, exit] = [`FAILED (exit ${r.exit})`, r.exit];
      }
      if (status !== "ok") break;
    }
    const seconds = (performance.now() - started) / 1000;
    say(`      [${status}] ${seconds.toFixed(1)}s`);
    await db.query("INSERT INTO ops.steps (run_id, section, step, status, exit_code, seconds, output) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
      run,
      section.name,
      step.title,
      status,
      exit,
      seconds,
      output.slice(-500),
    ]);
    if (status !== "ok") return step.title;
  }
  return null;
}

const section = (name: string) => doc.sections.find((s) => s.name === name)!;
let outcome = "succeeded";
if (await runSection(section("Preconditions"))) outcome = "precondition failed: nothing was changed";
else {
  const failedAt = (await runSection(section("Steps"))) ?? (await runSection(section("Verification")));
  if (failedAt) {
    say(`  stopped at "${failedAt}". Rollback (${doc.file}):`);
    for (const s of section("Rollback").steps) {
      say(`    ${s.title}`);
      for (const b of s.blocks) for (const l of b.code.trimEnd().split("\n")) say(`      ${b.lang === "manual" ? "MANUAL: " : "$ "}${l}`);
    }
    if (autoRollback) outcome = (await runSection(section("Rollback"))) ? "failed, rollback failed too" : "failed, rolled back";
    else outcome = "failed, rollback printed for the operator";
  }
}
await db.query("UPDATE ops.runs SET finished_at = now(), outcome = $2 WHERE id = $1", [run, outcome]);
say(`runbook #${run}: ${outcome}`);
await db.end();
process.exitCode = outcome === "succeeded" ? 0 : outcome.startsWith("precondition") ? 2 : 1;
