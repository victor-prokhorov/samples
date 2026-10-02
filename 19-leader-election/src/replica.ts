import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { clock, db } from "./db.js";

const TTL_MS = 3000;
const RENEW_MS = 1000;

const LEASE_SQL = `
  WITH prev AS (SELECT holder, expires_at FROM leases WHERE name = 'scheduler'),
  up AS (
    INSERT INTO leases AS l (name, holder, term, renewed_at, expires_at)
    VALUES ('scheduler', $1, 1, now(), now() + make_interval(secs => $2 / 1000.0))
    ON CONFLICT (name) DO UPDATE SET
      holder = EXCLUDED.holder,
      term = CASE WHEN l.holder = EXCLUDED.holder AND l.expires_at > now() THEN l.term ELSE l.term + 1 END,
      renewed_at = EXCLUDED.renewed_at,
      expires_at = EXCLUDED.expires_at
    WHERE l.holder = EXCLUDED.holder OR l.expires_at <= now()
    RETURNING term
  )
  SELECT up.term, prev.holder AS prev_holder, round(extract(epoch FROM now() - prev.expires_at)::numeric, 1) AS expired_ago
  FROM up LEFT JOIN prev ON true`;

const name = process.argv[2] ?? "replica";
const withoutElection = process.argv.includes("--no-election");
let term = 0;
let renewedAt = 0;
let leader = "";
let pauseAt = "";

function say(message: string) {
  return new Promise<void>((resolve) => process.stdout.write(`   ${clock()} [${name}] ${message}\n`, () => resolve()));
}

async function heartbeat() {
  const sentAt = performance.now();
  const { rows } = await db.query<{ term: number; prev_holder: string | null; expired_ago: string | null }>(LEASE_SQL, [name, TTL_MS]);
  const lease = rows[0];
  if (lease) {
    renewedAt = sentAt;
    if (lease.term !== term) {
      const previous = lease.prev_holder && lease.prev_holder !== name ? `; ${lease.prev_holder}'s lease had expired ${lease.expired_ago}s ago` : "";
      say(`acquired the lease, term ${lease.term}${previous}`);
    }
    term = lease.term;
    leader = name;
    return;
  }
  const { rows: [current] } = await db.query<{ holder: string; term: number }>("SELECT holder, term FROM leases WHERE name = 'scheduler'");
  if (term) say(`renew refused: ${current.holder} holds term ${current.term}; stepping down`);
  else if (current.holder !== leader) say(`follower, ${current.holder} leads (term ${current.term})`);
  term = 0;
  leader = current.holder;
}

async function pauseIf(point: string, where: string) {
  if (pauseAt !== point) return;
  pauseAt = "";
  await say(`${where}: SIGSTOP now (a GC pause stand-in)`);
  process.kill(process.pid, "SIGSTOP");
  await say("SIGCONT: resumed");
}

async function runJob() {
  const age = performance.now() - renewedAt;
  if (age >= TTL_MS) {
    say(`self-fenced: last renew was sent ${(age / 1000).toFixed(1)}s ago, past the ${TTL_MS / 1000}s TTL, so the lease may be someone else's; job skipped`);
    return;
  }
  const checked = term;
  await pauseIf("check", `lease check passed for term ${checked}, before the write`);
  await db.query("INSERT INTO ticks (holder, term) VALUES ($1, $2)", [name, checked]);
  const rejected = await db.query("INSERT INTO fenced_ticks (holder, term) VALUES ($1, $2)", [name, checked]).then(
    () => "",
    (err) => (err instanceof Error ? err.message : String(err)),
  );
  say(rejected ? `job ran, term ${checked}: ticks accepted it, fenced_ticks REJECTED it (${rejected})` : `job ran, term ${checked}`);
}

async function stop() {
  const { rowCount } = await db.query("UPDATE leases SET expires_at = now() WHERE name = 'scheduler' AND holder = $1 AND term = $2", [name, term]);
  await say(rowCount ? `SIGTERM: released the lease (term ${term}) so a follower need not wait for the TTL; exiting` : "SIGTERM: exiting");
  process.exit(0);
}

async function main() {
  process.on("SIGUSR1", () => {
    pauseAt = "check";
  });
  process.on("SIGUSR2", () => {
    pauseAt = "renew";
  });
  process.on("SIGTERM", () => void stop());
  say(`started (pid ${process.pid})${withoutElection ? ", no election" : `, lease TTL ${TTL_MS / 1000}s, renew every ${RENEW_MS / 1000}s`}`);
  for (;;) {
    if (withoutElection) {
      await db.query("INSERT INTO ticks (holder) VALUES ($1)", [name]);
      say("job ran");
    } else {
      await heartbeat().catch((err) => say(`heartbeat failed: ${err instanceof Error ? err.message : String(err)}`));
      if (term) {
        await pauseIf("renew", `renewed term ${term}, before the job's lease check`);
        await runJob();
      }
    }
    await sleep(RENEW_MS);
  }
}

main();
