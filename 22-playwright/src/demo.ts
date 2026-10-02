import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

type Result = { status: string; workerIndex: number; duration: number; retry: number; errors: { message?: string }[]; attachments: { name: string; path?: string }[] };
type Spec = { title: string; tests: { projectName: string; results: Result[] }[] };
type Suite = { title: string; specs: Spec[]; suites?: Suite[] };
type Row = { project: string; title: string } & Result;

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

function run(args: string[], env: Record<string, string> = {}) {
  const shown = Object.entries(env).map(([k, v]) => `${k}=${v} `).join("");
  console.log(`   $ ${shown}npx ${args.join(" ")}`);
  // Merged and with colour codes stripped, so the log reads like a terminal; paths relative to this folder, so it does not depend on the checkout.
  const r = spawnSync("sh", ["-c", `npx ${args.join(" ")} 2>&1`], { encoding: "utf8", env: { ...process.env, ...env } });
  process.stdout.write(r.stdout.replace(/\x1b\[[0-9;]*m/g, "").replaceAll(process.cwd() + "/", "").replaceAll(process.cwd(), "."));
  console.log(`   -> exit ${r.status}`);
  return r.status;
}

function e2e(name: string, files: string[], env: Record<string, string> = {}, extra: string[] = []) {
  const report = `reports/${name}.json`;
  const status = run(["playwright", "test", ...files, `--output=test-results/${name}`, ...extra], { ...env, REPORT: report });
  const flatten = (s: Suite, prefix: string[]): Row[] => [
    ...s.specs.flatMap((spec) => spec.tests.flatMap((t) => t.results.map((r) => ({ project: t.projectName, title: [...prefix, spec.title].join(" > "), ...r })))),
    ...(s.suites ?? []).flatMap((child) => flatten(child, [...prefix, child.title])),
  ];
  const rows = (JSON.parse(readFileSync(report, "utf8")).suites as Suite[]).flatMap((s) => flatten(s, []));
  for (const r of rows) console.log(`   ${r.status.padEnd(7)} [${r.project}] ${r.title.padEnd(60)} worker ${r.workerIndex}, ${r.duration} ms`);
  const by = (title: string) => rows.find((r) => r.title.endsWith(title));
  return { status, rows, by };
}

step("1. Unit tests of the domain rule (Vitest)", "the rule that decides whether a change request is accepted is a pure function; its edge cases (90th vs 91st day, same kind vs other kind) are cheap to test exhaustively here, so the browser tests only need one journey per outcome");
check(run(["vitest", "run", "--reporter=verbose"]) === 0, "unit tests pass");

step("2. User journeys in Chromium, 2 workers, one database per worker, login once", "the setup project signs in through the UI once and saves the cookie (storageState); every journey starts signed in. Each worker clones its own database from a template and runs its own app server, and each test truncates the requests table first (no transaction: the browser's requests run on other connections). Locators are roles and labels, the way a user and a screen reader find things");
const journeys = e2e("journeys", ["e2e/journeys.spec.ts"]);
const workers = new Set(journeys.rows.filter((r) => r.project === "chromium").map((r) => r.workerIndex));
check(journeys.status === 0 && journeys.rows.every((r) => r.status === "passed"), "every journey passes");
check(workers.size >= 2, "the journeys ran in parallel on at least 2 workers");
const state = JSON.parse(readFileSync(".auth/alice.json", "utf8"));
const sid = state.cookies.find((c: { name: string }) => c.name === "sid");
console.log(`   storageState .auth/alice.json: cookie sid=${sid.value.slice(0, 8)}... httpOnly=${sid.httpOnly} sameSite=${sid.sameSite}; journeys ran on workers ${[...workers].join(", ")}`);
check(sid?.httpOnly === true, "the saved session is the HttpOnly cookie");

step("3. The same journeys without the per-test reset, on one worker", "tests now share whatever the previous test left behind: the address test finds the email test's request and counts 3 rows instead of 2. The failure depends on test order, which is the signature of a leaking fixture. Playwright replaces a worker after a failure, so the next test gets a freshly cloned database and passes again");
const leaky = e2e("leaky", ["e2e/journeys.spec.ts"], { NO_RESET: "1" }, ["--workers=1"]);
const failed = leaky.rows.filter((r) => r.status === "failed").map((r) => r.title);
console.log(`   failed: ${JSON.stringify(failed)}`);
check(leaky.status === 1 && failed.length === 1 && failed[0] === "request an address change and see it pending", "only the test that runs after another writer fails");
check(/Expected: 2\s+Received: 3/.test(leaky.by("request an address change and see it pending")?.errors[0]?.message?.replace(/\x1b\[[0-9;]*m/g, "") ?? ""), "it saw the leftover row");

step("4. A fixed sleep against an auto-waiting assertion, fast API (100 ms)", "the total is filled by a fetch after the page loads. waitForTimeout(500) then reading textContent passes while the API answers in 100 ms; toHaveText retries until the text matches or 5 s pass");
const fast = e2e("waiting-fast", ["e2e/waiting.spec.ts"], { API_DELAY_MS: "100" });
check(fast.status === 0, "both pass when the API is fast");

step("5. The same two tests, slow API (1500 ms): the flake made deterministic", "a slow CI runner or a loaded database is all it takes: the fixed sleep reads 'Loading total...' and fails, the web-first assertion waits and passes. trace: retain-on-failure keeps a trace (DOM snapshots, network, console, each action) only for the failure");
const slow = e2e("waiting-slow", ["e2e/waiting.spec.ts"], { API_DELAY_MS: "1500" });
const sleepy = slow.by("total after a fixed 500 ms sleep");
const trace = sleepy?.attachments.find((a) => a.name === "trace")?.path ?? "";
console.log(`   trace of the failed test: ${trace.replace(process.cwd() + "/", "")}`);
check(slow.status === 1 && sleepy?.status === "failed" && slow.by("total with a web-first assertion")?.status === "passed", "only the fixed sleep fails");
check(existsSync(trace), "a trace is kept for the failure");

step("6. CSS selectors against role and label locators, after a markup refactor (MARKUP=v2)", "the refactor keeps every label and button text but changes structure and classes: the CSS test breaks though a user sees no difference; the role and label test still passes");
const v1 = e2e("locators-v1", ["e2e/locators.spec.ts"]);
check(v1.status === 0, "both locator styles pass on the original markup");
const v2 = e2e("locators-v2", ["e2e/locators.spec.ts"], { MARKUP: "v2" });
check(v2.status === 1 && v2.by("sign in with CSS selectors")?.status === "failed" && v2.by("sign in with role and label locators")?.status === "passed", "only the CSS test breaks");
