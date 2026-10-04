import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { exposureChart, type Step } from "./chart.js";
import { PORT, db } from "./db.js";
import { FlagClient, bucket, setFlag } from "./flags.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(label: string, cond: boolean) {
  console.log(`   ${cond ? "ok" : "FAILED"}: ${label}`);
  if (!cond) process.exitCode = 1;
}

const TENANTS = ["acme", "acme", "acme", "acme", "acme", "globex", "globex", "globex", "initech", "initech"];
const members = Array.from({ length: 10_000 }, (_, i) => ({ id: `M${String(i + 1).padStart(5, "0")}`, tenant: TENANTS[i % 10] }));

type Statement = { member: string; tenant: string; page: string; projection: string; bulkUpload: boolean; valuation: string };
async function statement(member: string, tenant: string): Promise<Statement> {
  const r = await fetch(`http://localhost:${PORT}/statement?member=${member}&tenant=${tenant}`);
  return (await r.json()) as Statement;
}

async function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], { stdio: "inherit" });
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`http://localhost:${PORT}/health`);
      return child;
    } catch {
      await sleep(100);
    }
  }
  throw new Error("server did not start");
}

// Poll the server until a condition holds; returns how long it took. Used where a test waits on the server's cache.
async function until(cond: () => Promise<boolean>, timeoutMs = 10_000) {
  const t0 = performance.now();
  while (!(await cond())) {
    if (performance.now() - t0 > timeoutMs) return Infinity;
    await sleep(5);
  }
  return performance.now() - t0;
}

// a seeded PRNG for the naive comparison, so the log is reproducible
let seed = 42;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

async function main() {
  const server = await startServer();
  const local = await new FlagClient(db, { ttlMs: 5000, listen: true }).start();
  const waiters = new Map<string, () => void>();
  local.onInvalidate = (key) => waiters.get(key)?.();
  const changed = (key: string) => new Promise<void>((resolve) => waiters.set(key, resolve));

  step("1. Release toggle, stored in Postgres, every change audited", "the new statement page is merged and deployed dark; turning it on is a row update that names who and why, not a deploy");
  const flags = await db.query("SELECT key, kind, enabled, percentage, tenants, expires_on::text FROM flags ORDER BY key");
  for (const f of flags.rows) console.log(`   ${f.key.padEnd(22)} ${f.kind.padEnd(10)} enabled=${f.enabled} pct=${f.percentage} tenants={${f.tenants}} expires ${f.expires_on}`);
  const before = await statement("M00001", "acme");
  console.log(`   GET /statement M00001 (acme): page=${before.page}`);
  check("the release toggle is off by default: members get the old page", before.page === "old");
  const waitRelease = changed("new-statement-page");
  const version = await setFlag(db, "new-statement-page", { enabled: true }, "alice (release manager)", "statement rewrite signed off by the statements team");
  await waitRelease;
  const tookMs = await until(async () => (await statement("M00001", "acme")).page === "new");
  console.log(`   setFlag(new-statement-page, enabled=true) -> version ${version}; the server served the new page ${tookMs.toFixed(0)} ms after the commit`);
  check("turning the toggle on reaches the running server without a restart", tookMs < 1000);
  let refused = "";
  try {
    await db.query("UPDATE flags SET enabled = false WHERE key = 'new-statement-page'");
  } catch (e) {
    refused = (e as Error).message;
  }
  console.log(`   a raw UPDATE without app.actor: ${refused || "accepted"}`);
  check("an anonymous flag change is refused by the audit trigger", refused.includes("without app.actor"));
  const audit = await db.query("SELECT actor, reason, before->>'enabled' AS was, after->>'enabled' AS now FROM flag_audit WHERE flag_key = 'new-statement-page' AND action = 'update'");
  for (const a of audit.rows) console.log(`   audit: ${a.actor}: enabled ${a.was} -> ${a.now} ("${a.reason}")`);
  check("the change is in flag_audit with actor, reason, before and after", audit.rowCount === 1 && audit.rows[0].was === "false" && audit.rows[0].now === "true");

  step("2. Percentage rollout with a stable hash", "bucket = sha256(flag key + member id) mod 10000; on when bucket < percentage x 100. Raising the percentage only adds buckets, so a member who had the feature keeps it");
  const steps: Step[] = [];
  let prevStable = new Set<string>();
  let prevNaive = new Set<string>();
  let flapStable = 0;
  let flapNaive = 0;
  for (const pct of [1, 10, 50, 100]) {
    const seen = changed("projection-v2");
    await setFlag(db, "projection-v2", { percentage: pct }, "bob (statements team)", `rollout step ${pct}%`);
    await seen;
    const readsBefore = local.stats.reads;
    const rows: [string, string, boolean, boolean][] = [];
    for (const m of members) {
      const on = await local.getBooleanValue("projection-v2", false, { targetingKey: m.id, tenant: m.tenant });
      const naive = random() < pct / 100;
      rows.push([m.id, m.tenant, on, naive]);
      if (pct === 10) {
        // the same member loads the page a second time
        if ((await local.getBooleanValue("projection-v2", false, { targetingKey: m.id })) !== on) flapStable++;
        if (random() < pct / 100 !== naive) flapNaive++;
      }
    }
    await db.query(
      `INSERT INTO exposures (flag_key, percentage, member_id, tenant, stable, naive)
       SELECT 'projection-v2', $1, * FROM unnest($2::text[], $3::text[], $4::boolean[], $5::boolean[])`,
      [pct, rows.map((r) => r[0]), rows.map((r) => r[1]), rows.map((r) => r[2]), rows.map((r) => r[3])],
    );
    const stable = new Set(rows.filter((r) => r[2]).map((r) => r[0]));
    const naive = new Set(rows.filter((r) => r[3]).map((r) => r[0]));
    const kept = [...prevStable].filter((id) => stable.has(id)).length;
    const s: Step = { pct, on: stable.size, kept, lost: prevStable.size - kept, naiveOn: naive.size, naiveLost: [...prevNaive].filter((id) => !naive.has(id)).length, members: members.length };
    steps.push(s);
    console.log(`   ${String(pct).padStart(3)}%: stable ${String(s.on).padStart(5)} on (${((100 * s.on) / members.length).toFixed(2)}%), kept ${s.kept}, lost ${s.lost} | naive ${String(s.naiveOn).padStart(5)} on, lost ${s.naiveLost} | ${members.length} evaluations, ${local.stats.reads - readsBefore} flag read from Postgres`);
    prevStable = stable;
    prevNaive = naive;
  }
  check("every step is within 3 standard deviations of its target", steps.every((s) => Math.abs(s.on - (s.pct / 100) * s.members) <= 3 * Math.sqrt(s.members * (s.pct / 100) * (1 - s.pct / 100)) + 1));
  check("nobody lost the feature as the percentage grew from 1 to 10 to 50 to 100%", steps.every((s) => s.lost === 0) && steps.at(-1)!.on === members.length);
  check("a fresh random draw per request takes the feature away from members at every step but the last", steps.slice(1, 3).every((s) => s.naiveLost > 0));
  console.log(`   at 10%, a second page load gave a different answer to ${flapStable} members (stable hash) and ${flapNaive} members (fresh random draw)`);
  check("the stable hash gives a member the same answer on every request", flapStable === 0 && flapNaive > 1000);
  const both = members.filter((m) => bucket("projection-v2", m.id) < 1000 && bucket("new-statement-page", m.id) < 1000).length;
  console.log(`   members in the first 10% of both projection-v2 and new-statement-page: ${both} (independent flags: about 10% x 10% x 10000 = 100)`);
  check("the flag key is in the hash, so each flag picks a different 10% of members", both > 50 && both < 150);
  await setFlag(db, "projection-v2", { percentage: 50 }, "bob (statements team)", "back to 50% to compare server and local answers");
  const sample = members.filter((_, i) => i % 50 === 0);
  const upper = members.find((m) => bucket("projection-v2", m.id) >= 5000)!;
  await until(async () => (await statement(upper.id, upper.tenant)).projection === "v1");
  let agree = 0;
  for (const m of sample) if (((await statement(m.id, m.tenant)).projection === "v2") === (bucket("projection-v2", m.id) < 5000)) agree++;
  console.log(`   at 50%: the server and this process agree on ${agree} of ${sample.length} members`);
  check("any process computes the same answer for the same member (no shared session state)", agree === sample.length);

  step("3. Per-tenant targeting", "the bulk upload goes to Acme first; Globex and Initech keep the old flow until Acme's employers have used it for a month");
  const tenantView = async () => Object.fromEntries(await Promise.all(["acme", "globex", "initech"].map(async (t) => [t, (await statement(`M-${t}`, t)).bulkUpload])));
  console.log(`   before: ${JSON.stringify(await tenantView())}`);
  await setFlag(db, "employer-bulk-upload", { tenants: ["acme"] }, "carol (employer team)", "pilot with Acme");
  await until(async () => (await statement("M-acme", "acme")).bulkUpload);
  const acmeOnly = await tenantView();
  console.log(`   tenants={acme}: ${JSON.stringify(acmeOnly)}`);
  check("only Acme sees the bulk upload", acmeOnly.acme && !acmeOnly.globex && !acmeOnly.initech);
  await setFlag(db, "employer-bulk-upload", { tenants: ["acme", "globex"] }, "carol (employer team)", "Acme pilot went well, add Globex");
  await until(async () => (await statement("M-globex", "globex")).bulkUpload);
  const two = await tenantView();
  console.log(`   tenants={acme,globex}: ${JSON.stringify(two)}`);
  check("adding Globex leaves Initech on the old flow", two.acme && two.globex && !two.initech);

  step("4. Ops kill switch during an incident", "the live valuation call is slow and the valuation service is timing out; on-call turns it off and the very next evaluation stops calling it");
  type Hit = { start: number; ms: number; live: boolean };
  const hits: Hit[] = [];
  let traffic = true;
  const loop = (async () => {
    let i = 0;
    while (traffic) {
      const start = performance.now();
      const s = await statement(members[i++ % members.length].id, "acme");
      hits.push({ start, ms: performance.now() - start, live: s.valuation === "live" });
    }
  })();
  await sleep(800);
  await setFlag(db, "ops-live-valuation", { enabled: false }, "dave (ops on-call)", "INC-0412: valuation service timeouts, turn off live valuation");
  const committed = performance.now();
  await sleep(800);
  traffic = false;
  await loop;
  const beforeKill = hits.filter((h) => h.start < committed);
  const afterKill = hits.filter((h) => h.start >= committed);
  const stillLive = afterKill.filter((h) => h.live).length;
  const mean = (xs: Hit[]) => xs.reduce((a, h) => a + h.ms, 0) / xs.length;
  console.log(`   before the switch: ${beforeKill.length} requests, mean ${mean(beforeKill).toFixed(1)} ms, live valuation on ${beforeKill.filter((h) => h.live).length}`);
  console.log(`   after the commit:  ${afterKill.length} requests, mean ${mean(afterKill).toFixed(1)} ms, live valuation on ${stillLive} (requests that started after the commit)`);
  check("the kill switch takes effect within one evaluation cycle (at most one request after the commit still made the call)", stillLive <= 1 && afterKill.length > 20);
  check("the statement gets fast again once the expensive call is off", mean(afterKill) < mean(beforeKill) / 3);

  step("5. Without LISTEN/NOTIFY, the cache TTL is the delay", "two clients with the same 5 s TTL; only one LISTENs. The incident is resolved and the switch goes back on: who sees it when?");
  const ttlOnly = await new FlagClient(db, { ttlMs: 5000, listen: false }).start();
  const seenAt: Record<string, number> = {};
  let polling = true;
  let t0 = 0;
  const poll = (async () => {
    while (polling) {
      for (const [name, c] of [["listen", local], ["ttl-only", ttlOnly]] as const) {
        if (!(name in seenAt) && (await c.getBooleanValue("ops-live-valuation", true)) && t0) seenAt[name] = performance.now() - t0;
      }
      await sleep(10);
    }
  })();
  await sleep(300);
  t0 = performance.now();
  await setFlag(db, "ops-live-valuation", { enabled: true }, "dave (ops on-call)", "INC-0412 resolved, live valuation back on");
  await until(async () => "listen" in seenAt && "ttl-only" in seenAt, 8000);
  polling = false;
  await poll;
  console.log(`   LISTEN client saw the change after ${seenAt.listen.toFixed(0)} ms, TTL-only client after ${seenAt["ttl-only"].toFixed(0)} ms`);
  check("NOTIFY invalidates in milliseconds; the TTL alone takes seconds", seenAt.listen < 1000 && seenAt["ttl-only"] > 3000 && seenAt["ttl-only"] > 5 * seenAt.listen);
  await ttlOnly.stop();
  const stats = (await fetch(`http://localhost:${PORT}/flags/stats`).then((r) => r.json())) as { evaluations: number; reads: number; invalidations: number };
  console.log(`   server cache: ${stats.evaluations} evaluations, ${stats.reads} reads from Postgres, ${stats.invalidations} invalidations by NOTIFY`);
  check("the cache answers almost every evaluation locally", stats.reads * 20 < stats.evaluations);

  step("6. Flag removal: CI fails on an expired flag still in the code", "lint-flags.ts scans the code for every key in the registry; a key past its expiry date that is still referenced fails the build");
  for (const dir of ["src", "fixtures/stale-app"]) {
    const r = spawnSync(process.execPath, ["--import", "tsx", "src/lint-flags.ts", dir], { encoding: "utf8" });
    console.log(`   $ tsx src/lint-flags.ts ${dir}   (exit ${r.status})`);
    for (const line of r.stdout.trim().split("\n")) console.log(`     ${line}`);
    if (dir === "src") check("the service's own code passes: no expired flag referenced", r.status === 0);
    else check("the stale copy fails CI and names the file, the line and the owner", r.status === 1 && /error {2}fixtures\/stale-app\/statement-pdf\.ts:6 {2}.legacy-pdf-renderer. EXPIRED/.test(r.stdout));
  }

  step("7. Exposure chart", "out/exposure.svg from the exposures table: members exposed per step (kept plus added) and members who lost the feature");
  const svg = exposureChart(steps, "out/exposure.svg");
  console.log(`   wrote out/exposure.svg (${svg.length} bytes, ${(svg.match(/<path /g) ?? []).length} bars)`);
  check("the chart was written", svg.includes("projection-v2 rollout"));

  await local.stop();
  server.kill("SIGTERM");
  await once(server, "exit");
  await db.end();
}

await main();
