import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type Level, pyramidSvg } from "./chart.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

async function run(cmd: string, args: string[], opts: { env?: Record<string, string>; show?: (line: string) => boolean } = {}) {
  console.log(`   $ ${[...Object.entries(opts.env ?? {}).map(([k, v]) => `${k}=${v}`), cmd, ...args].join(" ")}`);
  const started = performance.now();
  const child = spawn(cmd, args, { env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", ...opts.env } });
  let out = "";
  const plain = (d: Buffer) => d.toString().replace(/\x1b\[[0-9;]*m/g, "");
  child.stdout.on("data", (d) => (out += plain(d)));
  child.stderr.on("data", (d) => (out += plain(d)));
  const [code] = (await once(child, "close")) as [number | null];
  const ms = performance.now() - started;
  for (const l of out.split("\n").filter((l) => l.trim() && (opts.show ? opts.show(l) : true))) console.log(`   | ${l}`);
  console.log(`   -> exit ${code} in ${(ms / 1000).toFixed(1)} s`);
  return { code: code ?? 1, out, ms };
}

const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const testLines = (l: string) => /^\s*(✓|×|✘|FAIL\s)|Tests\s|passed|failed/.test(l) && !/^\s*\d+\)/.test(l);

// Vitest's JSON report (Jest's format): count and the tests' own time.
function vitestLevel(level: string, label: string, file: string, wallMs: number): Level {
  const r = json(file);
  const tests = r.testResults.flatMap((f: { assertionResults: { duration: number; status: string }[] }) => f.assertionResults);
  return { level, label, tests: r.numTotalTests, passed: r.numPassedTests, wallMs, testMs: tests.reduce((s: number, t: { duration: number }) => s + (t.duration ?? 0), 0) };
}

// Playwright's JSON report: every result of every test, in order.
interface PwResult {
  title: string;
  status: string;
  duration: number;
}
function playwrightResults(file: string): PwResult[] {
  const out: PwResult[] = [];
  const walk = (suite: { specs?: { title: string; tests: { results: { status: string; duration: number }[] }[] }[]; suites?: unknown[] }) => {
    for (const spec of suite.specs ?? []) for (const t of spec.tests) for (const r of t.results) out.push({ title: spec.title, status: r.status, duration: r.duration });
    for (const s of (suite.suites ?? []) as (typeof suite)[]) walk(s);
  };
  for (const s of json(file).suites) walk(s);
  return out;
}

mkdirSync(".tmp", { recursive: true });
const levels: Level[] = [];
const vitestArgs = (project: string) => ["vitest", "run", "--project", project, "--reporter=verbose", "--reporter=json", `--outputFile.json=.tmp/${project}.json`];

step("1. Unit: the rules as pure functions", "parsing the rate (\"6,5\" is 6.5), the 2-15% range in steps of 0.5, the first-of-the-month window, the employer match capped at 5%: boundaries tested exhaustively, no DOM, no network, no database");
let r = await run("npx", vitestArgs("unit"), { show: testLines });
levels.push(vitestLevel("unit", "Unit", ".tmp/unit.json", r.ms));
check(r.code === 0 && levels[0].tests >= 30, "the unit level passes with 30 or more tests");

step("2. Component: the React form in jsdom, the network mocked by MSW", "Testing Library renders the real component; user-event types, tabs and clicks like a person; queries go by role, label and accessible description (what a screen reader announces); MSW answers fetch with the API's shapes and fails any request nobody mocked");
r = await run("npx", vitestArgs("component"), { show: testLines });
levels.push(vitestLevel("component", "Component", ".tmp/component.json", r.ms));
check(r.code === 0 && levels[1].tests >= 8, "the component level passes");

step("3. API integration: the HTTP handler against a real Postgres", "only here do SQL, numeric columns returned as strings, the CHECK constraint and the partial unique index under two concurrent requests get exercised; Postgres 16 in Docker on 55464, a database of its own, truncated before each test");
r = await run("npx", vitestArgs("api"), { show: testLines });
levels.push(vitestLevel("api", "API + Postgres", ".tmp/api.json", r.ms));
check(r.code === 0 && levels[2].tests >= 6, "the API level passes");

step("4. End to end: one smoke test in Chromium", "the whole journey once (page, bundle, API, database, reload): it proves the parts are wired together, not the rules, which the levels below already cover");
r = await run("npx", ["playwright", "test", "e2e/smoke.spec.ts"], { env: { REPORT: ".tmp/e2e.json", SCREENSHOT: "screenshots/form-pending.png" }, show: testLines });
const e2e = playwrightResults(".tmp/e2e.json");
levels.push({ level: "e2e", label: "End to end", tests: e2e.length, passed: e2e.filter((t) => t.status === "passed").length, wallMs: r.ms, testMs: e2e.reduce((s, t) => s + t.duration, 0) });
check(r.code === 0 && e2e.length === 1 && e2e[0].status === "passed", "one end-to-end smoke test, passing");

step("5. The shape: count and time per level", "a pyramid has many cheap tests at the bottom and few expensive ones at the top; wall time is what CI pays for a level, start-up included, and the time per test says where a new test is cheapest to write");
console.log(`   ${"level".padEnd(16)} ${"tests".padStart(5)} ${"wall".padStart(7)} ${"tests' own".padStart(10)} ${"per test".padStart(9)}`);
for (const l of [...levels].reverse()) {
  console.log(`   ${l.label.padEnd(16)} ${String(l.tests).padStart(5)} ${`${(l.wallMs / 1000).toFixed(1)} s`.padStart(7)} ${`${l.testMs.toFixed(0)} ms`.padStart(10)} ${`${(l.testMs / l.tests).toFixed(1)} ms`.padStart(9)}`);
}
const [unit, component, api, top] = levels;
const total = levels.reduce((s, l) => s + l.tests, 0);
console.log(`   ${total} tests: ${((100 * (unit.tests + component.tests)) / total).toFixed(0)}% below the API, ${((100 * top.tests) / total).toFixed(0)}% end to end`);
check(unit.tests > component.tests && component.tests > api.tests && api.tests > top.tests, "the count narrows level by level: a pyramid");
const per = (l: Level) => l.testMs / l.tests;
check(per(unit) < per(component) && per(unit) < per(api) && per(top) > per(component) && per(top) > per(api), "a unit test is the cheapest and the end-to-end test the most expensive, per test");
writeFileSync("out/levels.json", JSON.stringify(levels.map((l) => ({ ...l, wallMs: Math.round(l.wallMs), testMs: Math.round(l.testMs) })), null, 2) + "\n");
writeFileSync("out/pyramid.svg", pyramidSvg(json("out/levels.json")));
console.log("   wrote out/levels.json and out/pyramid.svg");

step("6. A flaky end-to-end pattern next to the robust one", "the same submit, with the server adding no delay, then 1000 ms, in turn (LATENCY_MS=0,1000: a quiet machine, then a busy CI runner). Sleeping 500 ms and reading once passes when the answer is quick and fails when it is slow; a web-first assertion retries until the text appears (up to 5 s), so it passes every time and waits only as long as needed");
const flaky = await run("npx", ["playwright", "test", "e2e/flaky.spec.ts", "-g", "sleeps", "--repeat-each=6"], { env: { LATENCY_MS: "0,1000", REPORT: ".tmp/flaky.json" }, show: (l) => /^\s*(✓|✘)/.test(l) || /Received string|passed|failed/.test(l) });
const robust = await run("npx", ["playwright", "test", "e2e/flaky.spec.ts", "-g", "web-first", "--repeat-each=6"], { env: { LATENCY_MS: "0,1000", REPORT: ".tmp/robust.json" }, show: (l) => /^\s*(✓|✘)/.test(l) || /passed|failed/.test(l) });
const f = playwrightResults(".tmp/flaky.json");
const g = playwrightResults(".tmp/robust.json");
console.log(`   sleep + read once:     ${f.map((t, i) => `${i % 2 ? 1000 : 0}ms:${t.status === "passed" ? "pass" : "FAIL"}`).join(" ")}`);
console.log(`   web-first assertion:   ${g.map((t, i) => `${i % 2 ? 1000 : 0}ms:${t.status === "passed" ? "pass" : "FAIL"}`).join(" ")}`);
check(flaky.code !== 0 && f.length === 6 && f.filter((t, i) => i % 2 === 1).every((t) => t.status === "failed") && f.some((t) => t.status === "passed"), "the sleep fails on every slow answer and passes on quick ones: the same test, both results");
check(robust.code === 0 && g.length === 6 && g.every((t) => t.status === "passed"), "the web-first assertion passes 6 of 6");

step("7. The coverage gate", "@vitest/coverage-v8 measures the Vitest levels together; thresholds (lines, statements, functions 90%, branches 87%) turn a drop into a failed run. Coverage says what no test executed, not that what ran was checked");
const gate = await run("npx", ["vitest", "run", "--coverage"], { show: (l) => /\|/.test(l) || /Tests\s|ERROR|threshold/.test(l) });
// The summary is keyed by absolute path; keep the committed copy relative to this folder.
const rawSummary: Record<string, unknown> = json("out/coverage/coverage-summary.json");
writeFileSync("out/coverage/coverage-summary.json", JSON.stringify(Object.fromEntries(Object.entries(rawSummary).map(([k, v]) => [k.replace(`${process.cwd()}/`, ""), v]))) + "\n");
const summary = json("out/coverage/coverage-summary.json").total;
console.log(`   totals: lines ${summary.lines.pct}%, statements ${summary.statements.pct}%, functions ${summary.functions.pct}%, branches ${summary.branches.pct}%; HTML report in out/coverage/index.html`);
check(gate.code === 0 && summary.branches.pct >= 87 && summary.lines.pct >= 90, "the full suite clears every threshold");
console.log("\n   Now the same gate as if someone deleted the unit tests (only the component and API levels run):");
const drop = await run("npx", ["vitest", "run", "--coverage", "--project", "component", "--project", "api", "--coverage.reportsDirectory=.tmp/coverage-drop"], {
  show: (l) => /All files|contribution\.ts|Tests\s|ERROR/.test(l),
});
check(drop.code !== 0 && /ERROR: Coverage for branches \([\d.]+%\) does not meet global threshold \(87%\)/.test(drop.out), "without the unit tests the branch coverage falls under 87% and the run fails");

console.log("\nall checks passed");
