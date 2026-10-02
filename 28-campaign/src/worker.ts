import { setTimeout as sleep } from "node:timers/promises";
import pg from "pg";
import { YEAR, db } from "./db.js";
import { classify, sendStatement } from "./mailer.js";
import { renderStatement, statementData } from "./statement.js";

const WORKER = process.env.WORKER ?? `w${process.pid}`;
const RATE = Number(process.env.RATE ?? 5);
const LEASE_MS = Number(process.env.LEASE_MS ?? 2000);
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS ?? 4);
const BASE_BACKOFF_MS = Number(process.env.BASE_BACKOFF_MS ?? 250);
const CRASH_ON = process.env.CRASH_ON;

type Job = { member_id: number; attempts: number; message_id: string; was: string; prev_worker: string | null };

const log = (s: string) => console.log(`   [worker ${WORKER}] ${s}`);

// Claimable: due pending/retry jobs, and 'sending' jobs whose worker stopped renewing the lease (crashed or hung).
async function claim(): Promise<Job | undefined> {
  const { rows } = await db.query<Job>(
    `WITH next AS (
       SELECT year, member_id, status AS was, locked_by AS prev_worker FROM statement_jobs
       WHERE year = $1 AND ((status IN ('pending', 'retry') AND next_attempt_at <= now()) OR (status = 'sending' AND locked_until < now()))
       ORDER BY next_attempt_at, member_id
       LIMIT 1
       FOR UPDATE SKIP LOCKED)
     UPDATE statement_jobs j SET status = 'sending', attempts = j.attempts + 1, locked_by = $2, locked_until = now() + $3 * interval '1 millisecond'
     FROM next WHERE j.year = next.year AND j.member_id = next.member_id
     RETURNING j.member_id, j.attempts, j.message_id, next.was, next.prev_worker`,
    [YEAR, WORKER, LEASE_MS],
  );
  return rows[0];
}

// Every outcome is fenced on locked_by: a worker that lost its lease cannot overwrite the new owner's result.
async function finish(job: Job, outcome: "sent" | "retry" | "dead", detail: string, startedAt: Date, extra: { sha256?: string; delayMs?: number } = {}) {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const r = await c.query(
      `UPDATE statement_jobs SET status = $3, locked_by = NULL, locked_until = NULL, last_error = $4,
         sent_at = CASE WHEN $3 = 'sent' THEN now() END, pdf_sha256 = coalesce($5, pdf_sha256),
         next_attempt_at = now() + coalesce($6, 0) * interval '1 millisecond'
       WHERE year = $1 AND member_id = $2 AND status = 'sending' AND locked_by = $7`,
      [YEAR, job.member_id, outcome, outcome === "sent" ? null : detail, extra.sha256 ?? null, extra.delayMs ?? null, WORKER],
    );
    if (r.rowCount === 0) throw new Error(`lease on member ${job.member_id} lost to another worker`);
    await attempt(c, job, outcome, detail, startedAt);
    await c.query("COMMIT");
  } catch (err) {
    await c.query("ROLLBACK");
    throw err;
  } finally {
    c.release();
  }
}

function attempt(c: pg.PoolClient | pg.Pool, job: Job, outcome: string, detail: string, at: Date) {
  return c.query("INSERT INTO statement_attempts (year, member_id, attempt, worker, outcome, detail, at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    YEAR,
    job.member_id,
    job.attempts,
    WORKER,
    outcome,
    detail,
    at,
  ]);
}

let lastSend = 0;
async function throttle() {
  const due = lastSend + 1000 / RATE;
  while (Date.now() < due) await sleep(due - Date.now());
  lastSend = Date.now();
  return new Date(lastSend);
}

async function process1(job: Job) {
  const data = await statementData(job.member_id, YEAR);
  const who = `${data.member.member_no} ${data.member.email.padEnd(20)} attempt ${job.attempts}`;
  if (job.was === "sending") {
    const detail = `attempt ${job.attempts - 1} by worker ${job.prev_worker} has no outcome (lease expired): the mail may or may not have gone; resending with the same Message-ID`;
    log(`${data.member.member_no} ${detail}`);
    await attempt(db, { ...job, attempts: job.attempts - 1 }, "in_doubt", detail, new Date());
  }
  const { pdf, sha256 } = await renderStatement(data, YEAR);
  const startedAt = await throttle();
  try {
    const info = await sendStatement(data.member.email, data.member.name, YEAR, data.member.member_no, pdf);
    if (CRASH_ON === data.member.member_no) {
      log(`${who}: ${info.response.split(" ")[0]} accepted by SMTP, now crashing (SIGKILL) before recording it`);
      process.kill(process.pid, "SIGKILL");
    }
    await finish(job, "sent", info.response, startedAt, { sha256 });
    log(`${who}: sent ${job.message_id}`);
    return "sent";
  } catch (err) {
    const { transient, detail } = classify(err);
    if (transient && job.attempts < MAX_ATTEMPTS) {
      const delayMs = Math.round(BASE_BACKOFF_MS * 2 ** (job.attempts - 1) * (0.5 + Math.random() / 2));
      await finish(job, "retry", detail, startedAt, { delayMs });
      log(`${who}: ${detail} -> retry in ${delayMs} ms`);
      return "retry";
    }
    await finish(job, "dead", detail, startedAt);
    log(`${who}: ${detail} -> dead letter (${transient ? `${MAX_ATTEMPTS} attempts used` : "permanent"})`);
    return "dead";
  }
}

const counts: Record<string, number> = { sent: 0, retry: 0, dead: 0 };
log(`started: ${RATE} msg/s, lease ${LEASE_MS} ms, max ${MAX_ATTEMPTS} attempts${CRASH_ON ? `, will crash after sending ${CRASH_ON}` : ""}`);
for (;;) {
  const job = await claim();
  if (job) {
    counts[await process1(job)]++;
    continue;
  }
  const { rows } = await db.query(
    `SELECT count(*)::int AS n, extract(epoch FROM min(CASE WHEN status = 'sending' THEN locked_until ELSE next_attempt_at END) - now()) * 1000 AS wait_ms
     FROM statement_jobs WHERE year = $1 AND status IN ('pending', 'retry', 'sending')`,
    [YEAR],
  );
  if (rows[0].n === 0) break;
  await sleep(Math.min(500, Math.max(20, Number(rows[0].wait_ms))));
}
log(`done: ${counts.sent} sent, ${counts.retry} retries scheduled, ${counts.dead} dead letters`);
await db.end();
