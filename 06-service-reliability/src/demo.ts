import { ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { check } from "./check.js";
import { paymentsDb } from "./db.js";
import type { Faults, Stats } from "./payments.js";
import { Backoff, Bulkhead, CallError, CallOptions, CATALOG_PORT, CircuitBreaker, OnFailure, PAYMENTS_PORT, RetryBudget, RetryPolicy, call, withRetries } from "./resilience.js";

type Timed = { ok: boolean; ms: number; error: string };

const children = new Set<ChildProcess>();

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function describe(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

async function timed(fn: () => Promise<unknown>): Promise<Timed> {
  const started = performance.now();
  try {
    await fn();
    return { ok: true, ms: Math.round(performance.now() - started), error: "" };
  } catch (err) {
    return { ok: false, ms: Math.round(performance.now() - started), error: describe(err) };
  }
}

function isStats(v: unknown): v is Stats {
  return typeof v === "object" && v !== null && "arrivals" in v && Array.isArray(v.arrivals) && "work" in v && Array.isArray(v.work);
}

async function setFaults(f: Partial<Faults>) {
  await call({ port: PAYMENTS_PORT, path: "/_faults", method: "PUT", body: { script: [], mode: "ok", capacity: 0, ...f } });
}

async function stats() {
  const { body } = await call({ port: PAYMENTS_PORT, path: "/_stats" });
  if (!isStats(body)) throw new Error("unexpected /_stats reply");
  return body;
}

async function startPayments() {
  const child = spawn(process.execPath, ["--import", "tsx", "src/payments.ts"], { stdio: "inherit" });
  children.add(child);
  for (let i = 0; i < 100; i++) {
    const ready = await timed(() => call({ port: PAYMENTS_PORT, path: "/_stats", timeoutMs: 200 }));
    if (ready.ok) return child;
    await sleep(100);
  }
  throw new Error("payments service did not start");
}

async function stopPayments(child: ChildProcess) {
  child.kill("SIGKILL");
  await once(child, "exit");
  children.delete(child);
  console.log(`   [payments pid ${child.pid}] killed`);
}

function spread(results: Timed[]) {
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  return ms[0] === ms[ms.length - 1] ? `${ms[0]}ms` : `${ms[0]}-${ms[ms.length - 1]}ms`;
}

const count = (results: Timed[], what: string) => results.filter((r) => (r.ok ? "ok" : r.error) === what).length;
const TIMEOUT_200 = "timeout (no reply within 200ms)";
// With x-deadline-ms both sides stop at ~200ms: usually the caller's timer fires first, but on a busy event loop
// payments' 504 (its statement_timeout) can land a millisecond earlier. Either way the call timed out.
const timedOut = (results: Timed[]) => results.filter((r) => !r.ok && (r.error === TIMEOUT_200 || r.error.startsWith("HTTP 504"))).length;

function tally(results: Timed[]) {
  const counts = new Map<string, number>();
  for (const r of results) counts.set(r.ok ? "ok" : r.error, (counts.get(r.ok ? "ok" : r.error) ?? 0) + 1);
  return [...counts].map(([what, n]) => `${n} ${what}`).join(", ");
}

async function timeouts() {
  step("1. Timeouts, then deadline propagation", "a call without a deadline waits as long as the dependency does; a timeout frees the caller, and sending the remaining budget (x-deadline-ms) lets the dependency stop working for a caller that already left");
  console.log("   payments /quote is degraded: 1500ms of database work per request (pg_sleep). 10 concurrent calls each time");
  const variants: [string, Partial<CallOptions>][] = [
    ["no timeout", {}],
    ["200ms timeout", { timeoutMs: 200 }],
    ["200ms timeout + x-deadline-ms", { timeoutMs: 200, propagateDeadline: true }],
  ];
  const db: number[] = [];
  for (const [label, options] of variants) {
    await setFaults({ mode: "slow" });
    const results = await Promise.all(Array.from({ length: 10 }, () => timed(() => call({ port: PAYMENTS_PORT, path: "/quote", ...options }))));
    await sleep(1700);
    const { work } = await stats();
    const dbMs = work.reduce((sum, w) => sum + w.ms, 0);
    console.log(`   ${label.padEnd(30)} caller: waited ${spread(results)}, ${tally(results)}`);
    console.log(`   ${"".padEnd(30)} payments: ${work.filter((w) => w.outcome === "completed").length} queries ran to completion, ${work.filter((w) => w.outcome !== "completed").length} cancelled at the deadline, ${dbMs}ms of DB time in total, ${work.filter((w) => w.callerGone).length} answers written to a closed connection`);
    const completed = work.filter((w) => w.outcome === "completed").length;
    const gone = work.filter((w) => w.callerGone).length;
    db.push(dbMs);
    if (label === "no timeout") check("no timeout: every caller waits out the 1500ms of DB work", count(results, "ok") === 10 && results.every((r) => r.ms >= 1500));
    else if (label === "200ms timeout") check("200ms timeout: callers are freed at ~200ms, but payments still runs all 10 queries and answers no one", count(results, TIMEOUT_200) === 10 && results.every((r) => r.ms < 500) && completed === 10 && gone === 10);
    else check("with x-deadline-ms: payments cancels all 10 queries at the deadline, under a third of the DB time", timedOut(results) === 10 && completed === 0 && dbMs * 3 < db[0]);
  }
}

async function bulkhead() {
  step("2. Bulkhead: one slow dependency must not starve the others", "a caller shares sockets (or threads) across dependencies; when one hangs it holds them all, so give each dependency its own bounded pool and reject beyond it");
  console.log("   payments stays degraded (1500ms), catalog is healthy. 10 payment calls go out, then 3 catalog calls 50ms later");
  await setFaults({ mode: "slow" });
  const shared = new http.Agent({ maxTotalSockets: 10 });
  const slow = Array.from({ length: 10 }, () => timed(() => call({ port: PAYMENTS_PORT, path: "/quote", timeoutMs: 3000, agent: shared })));
  await sleep(50);
  const catalog = await Promise.all(Array.from({ length: 3 }, () => timed(() => call({ port: CATALOG_PORT, path: "/items", timeoutMs: 3000, agent: shared }))));
  console.log(`   one shared pool (10 sockets)  payments: ${tally(await Promise.all(slow))}; catalog waited ${spread(catalog)} (queued behind payments)`);
  check("one shared pool: healthy catalog calls queue behind slow payments for over 1s", catalog.every((r) => r.ok && r.ms > 1000));
  await setFaults({ mode: "slow" });
  const paymentsPool = new Bulkhead(4);
  const paymentsAgent = new http.Agent({ maxSockets: 4 });
  const catalogAgent = new http.Agent({ maxSockets: 10 });
  const guarded = Array.from({ length: 10 }, () => timed(() => paymentsPool.run(() => call({ port: PAYMENTS_PORT, path: "/quote", timeoutMs: 3000, agent: paymentsAgent }))));
  await sleep(50);
  const isolated = await Promise.all(Array.from({ length: 3 }, () => timed(() => call({ port: CATALOG_PORT, path: "/items", timeoutMs: 3000, agent: catalogAgent }))));
  const settled = await Promise.all(guarded);
  console.log(`   bulkhead (payments limit 4)   payments: ${tally(settled)}, rejections took ${spread(settled.filter((r) => !r.ok))}; catalog waited ${spread(isolated)}`);
  check("bulkhead: 4 payment calls run, 6 are rejected at once, catalog answers in under 200ms", count(settled, "ok") === 4 && settled.filter((r) => !r.ok).every((r) => r.error.startsWith("bulkhead-full") && r.ms < 50) && isolated.every((r) => r.ok && r.ms < 200));
  for (const agent of [shared, paymentsAgent, catalogAgent]) agent.destroy();
}

const printAttempt: OnFailure = (attempt, err, next) => console.log(`      attempt ${attempt}: ${describe(err)} -> ${next}`);

async function retries() {
  step("3. Retry only what can succeed next time", "timeouts, connection resets, 503 and 429 are transient and worth retrying; a 400 will fail the same way forever. Backoff with full jitter, max 4 attempts, 300ms per attempt, 2s overall deadline");
  const policy: RetryPolicy = { maxAttempts: 4, backoff: "full-jitter", baseMs: 100, capMs: 1000, attemptTimeoutMs: 300, deadlineMs: 2000 };
  const cases: [string, Faults["script"]][] = [
    ["503, 503, then ok", ["503", "503", "ok"]],
    ["slow (timeout), then ok", ["slow", "ok"]],
    ["connection reset, then ok", ["reset", "ok"]],
    ["400 bad request", ["400", "ok"]],
    ["503 forever", ["503", "503", "503", "503", "503", "503"]],
  ];
  for (const [label, script] of cases) {
    await setFaults({ script });
    console.log(`   payments will answer: ${label}`);
    const result = await timed(() => withRetries(policy, (timeoutMs) => call({ port: PAYMENTS_PORT, path: "/quote", timeoutMs, propagateDeadline: true }), printAttempt));
    const received = (await stats()).arrivals.length;
    console.log(`      => ${result.ok ? "ok" : `failed: ${result.error}`} after ${result.ms}ms; payments received ${received} request(s)`);
    if (label === "400 bad request") check("a 400 is not retried: one request, then give up", !result.ok && received === 1);
    else if (label === "503 forever") check("503 forever: gives up after at most 4 attempts within the 2s deadline", !result.ok && received <= 4 && result.ms < 2100);
    else check(`${label}: the retry succeeds`, result.ok && received === script.length);
  }
}

function histogram(arrivals: number[], bucketMs: number) {
  const buckets = Array.from({ length: Math.floor(Math.max(...arrivals) / bucketMs) + 1 }, () => 0);
  for (const at of arrivals) buckets[Math.floor(at / bucketMs)]++;
  return buckets;
}

async function burst(label: string, faults: Partial<Faults>, backoff: Backoff, budget?: RetryBudget): Promise<{ arrivals: number; ok: number }> {
  await setFaults(faults);
  const policy: RetryPolicy = { maxAttempts: 5, backoff, baseMs: 100, capMs: 2000, attemptTimeoutMs: 1000, deadlineMs: 5000, budget };
  const agent = new http.Agent({ keepAlive: true, maxSockets: 200 });
  const outcomes = await Promise.all(Array.from({ length: 100 }, () => timed(() => withRetries(policy, (timeoutMs) => call({ port: PAYMENTS_PORT, path: "/quote", timeoutMs, agent })))));
  agent.destroy();
  const { arrivals } = await stats();
  const ok = outcomes.filter((o) => o.ok).length;
  console.log(`   ${label}`);
  console.log(`      arrivals per 100ms: ${histogram(arrivals, 100).map((n) => String(n).padStart(3)).join(" ")}`);
  console.log(`      ${arrivals.length} requests reached payments for 100 callers; ${ok} succeeded, ${100 - ok} gave up; slowest caller done after ${Math.max(...outcomes.map((o) => o.ms))}ms`);
  return { arrivals: arrivals.length, ok };
}

async function storm() {
  step("4. Retry storms: synchronized vs jittered retries, and a retry budget", "100 callers hit payments at the same instant (a deploy, a cache expiry). Payments serves 5 requests per 25ms (200/s) and sheds the rest with 503. Every caller retries up to 5 attempts, base 100ms, doubling");
  const immediate = await burst("immediate retries", { capacity: 5 }, "none");
  const lockstep = await burst("exponential backoff, no jitter (100, 200, 400, 800ms: every caller retries at the same instants)", { capacity: 5 }, "exponential");
  const jitter = await burst("exponential backoff, full jitter (random between 0 and 100, 200, 400, 800ms)", { capacity: 5 }, "full-jitter");
  check("full jitter gets more callers through than immediate retries or lockstep backoff, with fewer requests than either", jitter.ok > immediate.ok && jitter.ok > lockstep.ok && jitter.ok >= 90 && jitter.arrivals < Math.min(immediate.arrivals, lockstep.arrivals));
  console.log("   payments is fully down (503 for everything): retries cannot help, they only multiply the load");
  const unbudgeted = await burst("full jitter, no budget", { mode: "503" }, "full-jitter");
  const budgeted = await burst("full jitter + retry budget (each request earns 0.1 retry token, a retry costs 1, at most 10 banked)", { mode: "503" }, "full-jitter", new RetryBudget(0.1, 10));
  check("during a full outage every attempt is made without a budget (500 requests); the budget cuts that to at most 110", unbudgeted.arrivals === 500 && budgeted.arrivals <= 110);
}

async function idempotency() {
  step("5. Idempotency keys: retrying a POST without charging twice", "a timeout says nothing about whether the server committed; the caller sends one Idempotency-Key per logical charge and reuses it on every retry, the server stores the response under that key in the same transaction as the charge and replays it");
  const policy: RetryPolicy = { maxAttempts: 4, backoff: "full-jitter", baseMs: 100, capMs: 1000, attemptTimeoutMs: 300, deadlineMs: 3000 };
  let replays = 0;
  const charge = (customer: string, amount: string, key?: string) =>
    withRetries(policy, (timeoutMs) => call({ port: PAYMENTS_PORT, path: "/charges", method: "POST", body: { customer, amount }, headers: key ? { "idempotency-key": key } : {}, timeoutMs }), printAttempt).then((r) => {
      if (r.headers["idempotent-replayed"]) replays++;
      console.log(`      => ${r.status} ${JSON.stringify(r.body)}${r.headers["idempotent-replayed"] ? " (idempotent-replayed: stored response, no new charge)" : ""}`);
    });
  console.log("   alice, no key. payments commits the charge, then answers after 1000ms");
  await setFaults({ script: ["reply-late", "ok"] });
  await charge("alice", "42.00");
  console.log("   bob, key charge-bob-1. same fault");
  await setFaults({ script: ["reply-late", "ok"] });
  await charge("bob", "42.00", "charge-bob-1");
  console.log("   carol, key charge-carol-1 sent twice at once (a double click). payments holds the first transaction open for 1000ms");
  await setFaults({ script: ["commit-late", "ok", "ok", "ok"] });
  policy.attemptTimeoutMs = 2000;
  await Promise.all([charge("carol", "42.00", "charge-carol-1"), sleep(20).then(() => charge("carol", "42.00", "charge-carol-1"))]);
  console.log("   bob again, same key charge-bob-1 but amount 99.00");
  await setFaults({});
  const reused = await charge("bob", "99.00", "charge-bob-1").then(
    () => "",
    (err) => (console.log(`      => rejected: ${describe(err)}`), describe(err)),
  );
  check("reusing a key with a different request is rejected with 422", reused.includes("422"));
  check("bob's retry and carol's duplicate got the stored response back", replays === 2);
  const { rows } = await paymentsDb.query("SELECT customer, count(*)::int AS n FROM charges GROUP BY customer ORDER BY customer");
  const charges = Object.fromEntries(rows.map((r) => [r.customer, r.n]));
  check("without a key alice was charged twice; with one, bob and carol once each", charges.alice === 2 && charges.bob === 1 && charges.carol === 1);
  const keys = await paymentsDb.query("SELECT count(*)::int AS n FROM idempotency_keys");
  check("one stored response per key", keys.rows[0].n === 2);
}

async function traffic(durationMs: number, everyMs: number, fn: () => Promise<unknown>) {
  const calls: Promise<Timed>[] = [];
  const end = performance.now() + durationMs;
  while (performance.now() < end) {
    calls.push(timed(fn));
    await sleep(everyMs);
  }
  return Promise.all(calls);
}

async function breaker(payments: ChildProcess) {
  step("6. Circuit breaker: fail fast while the dependency is down", "after 5 consecutive failures the breaker opens and calls fail at once without touching payments; after a 1000ms cooldown it goes half-open and lets one probe through; the probe's result closes or reopens it");
  console.log("   the caller receives a request every 50ms and calls payments /quote with a 200ms timeout; payments is degraded (1500ms)");
  const quote = () => call({ port: PAYMENTS_PORT, path: "/quote", timeoutMs: 200, propagateDeadline: true });
  await setFaults({ mode: "slow" });
  const without = await traffic(2000, 50, quote);
  await sleep(300);
  const reachedWithout = (await stats()).arrivals.length;
  console.log(`   without a breaker, 2s: ${tally(without)}; each took ${spread(without)}; payments received ${reachedWithout} requests`);
  await setFaults({ mode: "slow" });
  const started = performance.now();
  const clock = () => `t+${String(Math.round(performance.now() - started)).padStart(4)}ms`;
  let state = "closed";
  const cb = new CircuitBreaker(5, 1000, (from, to, why) => {
    state = to;
    console.log(`      ${clock()} breaker ${from} -> ${to} (${why})`);
  });
  const guarded = () => cb.run(quote);
  const degraded = await traffic(2000, 50, guarded);
  await sleep(300);
  const reachedWith = (await stats()).arrivals.length;
  console.log(`   with a breaker, 2s degraded: ${tally(degraded)}; payments received ${reachedWith} requests; fast failures took ${spread(degraded.filter((r) => r.error === "breaker-open"))}`);
  check("without a breaker every call reaches the degraded payments and times out", timedOut(without) === without.length && reachedWithout === without.length);
  check("with a breaker, under a third of the calls reach payments; the rest fail fast", reachedWith * 3 < reachedWithout && degraded.filter((r) => r.error === "breaker-open").every((r) => r.ms < 20));
  await stopPayments(payments);
  const down = await traffic(1500, 50, guarded);
  console.log(`   with a breaker, 1.5s down: ${tally(down)}`);
  const restarted = await startPayments();
  console.log(`   ${clock()} payments restarted, healthy`);
  const healed = await traffic(1500, 50, guarded);
  console.log(`   with a breaker, 1.5s healed: ${tally(healed)}`);
  check("after the restart a probe succeeds, the breaker closes and calls succeed again", state === "closed" && count(healed, "ok") > 0 && healed.slice(-3).every((r) => r.ok));
  return restarted;
}

async function main() {
  let payments = await startPayments();
  console.log(`caller pid ${process.pid} -> payments :${PAYMENTS_PORT} (a separate process with its own Postgres database), catalog :${CATALOG_PORT}`);
  await timeouts();
  await bulkhead();
  await retries();
  await storm();
  await idempotency();
  payments = await breaker(payments);
  await stopPayments(payments);
  await paymentsDb.end();
}

process.on("exit", () => children.forEach((c) => c.kill("SIGKILL")));

main().catch((err) => {
  console.error(err instanceof CallError ? `call failed: ${err.message}` : err);
  process.exit(1);
});
