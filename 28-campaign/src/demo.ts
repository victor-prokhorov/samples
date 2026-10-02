import { spawn } from "node:child_process";
import { once } from "node:events";
import { YEAR, db } from "./db.js";
import { dryRun, enqueue, report } from "./campaign.js";
import { Sink } from "./sink.js";

const RATE = 10;

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

async function run(script: string, env: Record<string, string> = {}) {
  const child = spawn(process.execPath, ["--import", "tsx", `src/${script}.ts`], { stdio: "inherit", env: { ...process.env, ...env } });
  const [code, signal] = (await once(child, "exit")) as [number | null, string | null];
  return signal ?? String(code);
}

const jobStates = async () =>
  (await db.query("SELECT status, count(*)::int AS n, string_agg(m.member_no, ',' ORDER BY m.member_no) AS members FROM statement_jobs j JOIN members m ON m.id = j.member_id WHERE year = $1 GROUP BY status ORDER BY status", [YEAR])).rows;

function showCopies(sink: Sink) {
  const lines = [...sink.copies()].map(([to, ds]) => `${to.split("@")[0]} x${ds.length}`);
  console.log(`   SMTP sink received ${sink.deliveries.length} messages: ${lines.join(", ")}`);
}

const sink = new Sink();
await sink.listen();
const members = (await db.query("SELECT email FROM members ORDER BY id")).rows.map((r) => r.email as string);
console.log(`SMTP sink on :52528 in this process (scripted: bob greylisted twice, carol 550 unknown, dan 451 forever); ${members.length} members; workers are child processes`);

step("1. Naive campaign: a loop that sends, crashes, and is run again", "with no record of what was sent, a rerun after a crash sends again to everyone before the crash point; a transient 451 is logged and skipped, so that member never gets a statement");
console.log(`   run 1 -> ${await run("naive", { CRASH_ON: "M0007" })}`);
console.log(`   run 2 -> exit ${await run("naive")}`);
showCopies(sink);
const naive = sink.copies();
check(naive.get("alice@acme.example")?.length === 2 && naive.get("grace@globex.example")?.length === 2, "the rerun sent alice and grace a second statement");
check(!naive.has("bob@acme.example"), "bob was skipped on both runs and never got his statement");
sink.reset();

step("2. Create the campaign: one job per member and year", "the job table is the campaign's state; its primary key (year, member_id) makes creating the campaign idempotent, and a member is never queued twice for the same year");
const first = await enqueue(YEAR);
const second = await enqueue(YEAR);
console.log(`   enqueue ${YEAR}: ${first} jobs created; again: ${second}`);
check(first === members.length && second === 0, "enqueue is idempotent");

step("3. Dry run on a sample", "render real PDFs for a few members chosen by a stable hash, print what would be sent, send nothing and change no job: the check a person signs off before the batch starts");
const samples = await dryRun(YEAR, 3, "out");
console.log(`   text read back from ${samples[0].file}:`);
for (const line of samples[0].text) console.log(`     | ${line}`);
check(samples[0].text.some((l) => l.includes(`Total contributions ${YEAR}: ${samples[0].total}`)), "the PDF carries the member's total");
const again = await dryRun(YEAR, 3, "out", true);
check(again.every((s, i) => s.sha256 === samples[i].sha256), "rendering is deterministic: the same statement has the same sha256");
const touched = (await db.query("SELECT count(*)::int AS n FROM statement_jobs WHERE status <> 'pending' OR attempts > 0")).rows[0].n;
check(sink.deliveries.length === 0 && touched === 0, "the dry run sent nothing and left every job pending");
console.log(`   rendering twice gives the same sha256; SMTP received ${sink.deliveries.length} messages; jobs touched: ${touched}`);

step("4. Start the batch; the worker crashes midway", "a worker claims one due job at a time (UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED)), sets a lease, sends, then records the outcome; here it is killed after SMTP accepted M0007 and before it recorded that");
console.log(`   worker A -> ${await run("worker", { WORKER: "A", RATE: String(RATE), CRASH_ON: "M0007" })}`);
for (const s of await jobStates()) console.log(`   ${s.status.padEnd(8)} ${String(s.n).padStart(2)}  ${s.members}`);
const stuck = (await db.query("SELECT m.member_no, j.locked_by, j.locked_until > now() AS lease_live FROM statement_jobs j JOIN members m ON m.id = j.member_id WHERE status = 'sending'")).rows;
console.log(`   in doubt: ${JSON.stringify(stuck)}`);
check(stuck.length === 1 && stuck[0].member_no === "M0007", "exactly one job is in doubt: sent by SMTP, not recorded");
const beforeResume = sink.deliveries.length;

step("5. Resume with two workers in parallel, throttled", `B and C claim different rows (SKIP LOCKED skips rows another worker holds); sent jobs are never claimed again; M0007 is retaken once A's lease expires; ${RATE} msg/s in total (each worker ${RATE / 2}/s); 4xx retried with exponential backoff and jitter, 5xx or ${4} attempts -> dead letter`);
const t0 = new Date();
const [b, c] = await Promise.all([run("worker", { WORKER: "B", RATE: String(RATE / 2) }), run("worker", { WORKER: "C", RATE: String(RATE / 2) })]);
console.log(`   workers B -> exit ${b}, C -> exit ${c}`);
showCopies(sink);
const copies = sink.copies();
const grace = copies.get("grace@globex.example") ?? [];
console.log(`   grace: ${grace.length} copies, Message-IDs ${JSON.stringify([...new Set(grace.map((d) => d.messageId))])}`);
check(grace.length === 2 && new Set(grace.map((d) => d.messageId)).size === 1, "the in-doubt statement was sent again with the same Message-ID, so the receiving side can tell it is the same message");
const others = [...copies].filter(([to]) => to !== "grace@globex.example");
check(others.every(([, ds]) => ds.length === 1), "every other member received exactly one statement: nothing sent before the crash was sent again");
check(copies.get("bob@acme.example")?.length === 1, "bob got his statement after the greylisting retries");
check(!copies.has("carol@acme.example") && !copies.has("dan@acme.example"), "carol (550) and dan (451 every time) got nothing and are dead letters");
const window = (
  await db.query(
    `SELECT max(n)::int AS n FROM (SELECT (SELECT count(*) FROM statement_attempts b WHERE b.outcome <> 'in_doubt' AND b.at >= a.at AND b.at < a.at + interval '1 second') AS n
     FROM statement_attempts a WHERE a.outcome <> 'in_doubt' AND a.at >= $1) w`,
    [t0],
  )
).rows[0].n;
console.log(`   busiest 1-second window of SMTP attempts while resuming: ${window} (limit ${RATE}/s); messages received before the resume: ${beforeResume}`);
check(window <= RATE, "the throttle held");
const double = (await db.query("SELECT member_id FROM statement_attempts WHERE outcome = 'sent' GROUP BY member_id HAVING count(*) > 1")).rowCount;
check(double === 0, "the fence keeps one sent record per job");

step("6. The dead-letter list, then a fix and a requeue", "a dead letter keeps its last error for a person to act on; once the address is corrected, requeueing that one job sends it, and the rest of the campaign is untouched");
await report(YEAR);
await db.query("UPDATE members SET email = 'carol.petit@acme.example' WHERE member_no = 'M0003'");
await db.query("UPDATE statement_jobs SET status = 'pending', attempts = 0, next_attempt_at = now(), last_error = NULL WHERE year = $1 AND member_id = (SELECT id FROM members WHERE member_no = 'M0003')", [YEAR]);
console.log("   support corrects carol's address to carol.petit@acme.example and requeues her job");
console.log(`   worker D -> exit ${await run("worker", { WORKER: "D", RATE: String(RATE) })}`);
check(sink.copies().get("carol.petit@acme.example")?.length === 1, "carol's statement went to the corrected address");

step("7. Run the batch again after it finished", "every job is sent or dead, so a rerun (a cron firing twice, an operator retrying) claims nothing and sends nothing");
const n = sink.deliveries.length;
console.log(`   worker E -> exit ${await run("worker", { WORKER: "E", RATE: String(RATE) })}`);
check(sink.deliveries.length === n, "the rerun sent nothing");
console.log(`   SMTP sink still has ${n} messages`);

step("8. Campaign report", "what the business asks after a campaign: how many went out, per employer, how many needed retries, how many were resent in doubt, and who did not get one and why");
const r = await report(YEAR);
check(r.dead === 1 && r.in_doubt === 1, "one dead letter (dan), one in-doubt resend (grace)");

await sink.close();
await db.end();
