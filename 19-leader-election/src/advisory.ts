import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import pg from "pg";
import { check } from "./check.js";
import { clock, tx, url } from "./db.js";

const KEY = 18;

type Row = { ok: boolean; backend: number };

function say(who: string, message: string) {
  console.log(`   ${clock()} [${who}] ${message}`);
}

async function hold() {
  const client = new pg.Client(url);
  await client.connect();
  const { rows: [r] } = await client.query<Row>("SELECT pg_try_advisory_lock($1) AS ok, pg_backend_pid() AS backend", [KEY]);
  say("holder", `pg_try_advisory_lock(${KEY}) = ${r.ok} on backend ${r.backend} (pid ${process.pid}); holding it, with no lease row and no heartbeat`);
  setInterval(() => undefined, 60_000);
}

// `take <ms> held` expects the lock to stay taken for the whole wait; `take <ms> free` expects it at once.
async function take(waitMs: number, expect?: string) {
  const client = new pg.Client(url);
  await client.connect();
  const start = performance.now();
  let got = false;
  for (;;) {
    const { rows: [r] } = await client.query<Row>("SELECT pg_try_advisory_lock($1) AS ok, pg_backend_pid() AS backend", [KEY]);
    const waited = ((performance.now() - start) / 1000).toFixed(1);
    if (r.ok) {
      say("taker", `pg_try_advisory_lock(${KEY}) = true on backend ${r.backend} after ${waited}s`);
      got = performance.now() - start < 1000;
      break;
    }
    if (performance.now() - start >= waitMs) {
      say("taker", `pg_try_advisory_lock(${KEY}) still false after ${waited}s: another session holds it`);
      break;
    }
    await sleep(100);
  }
  if (expect === "held") check(waitMs ? `the paused holder's session still holds the lock after ${waitMs / 1000}s` : "another session holds the lock", !got);
  if (expect === "free") check("the killed holder's lock is free at once", got);
  await client.end();
}

async function pooler() {
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const first = await pool.connect();
  const second = await pool.connect();
  second.on("notice", (n) => say("pooler", `server says: ${n.message}`));
  const { rows: [locked] } = await first.query<Row>("SELECT pg_try_advisory_lock($1) AS ok, pg_backend_pid() AS backend", [KEY]);
  say("pooler", `transaction 1 runs on backend ${locked.backend}: pg_try_advisory_lock(${KEY}) = ${locked.ok}`);
  const { rows: [unlocked] } = await second.query<Row>("SELECT pg_advisory_unlock($1) AS ok, pg_backend_pid() AS backend", [KEY]);
  say("pooler", `transaction 2 runs on backend ${unlocked.backend}: pg_advisory_unlock(${KEY}) = ${unlocked.ok}`);
  const { rows: [held] } = await second.query<{ pid: number }>("SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND objid = $1 AND granted", [KEY]);
  say("pooler", `the lock is still held by backend ${held.pid}, an idle pooled connection; it stays held until that connection closes`);
  check("an unlock that lands on another pooled connection fails, and the lock stays held by the first", locked.ok && !unlocked.ok && held.pid === locked.backend && unlocked.backend !== locked.backend);
  await first.query("SELECT pg_advisory_unlock($1)", [KEY]);
  first.release();
  second.release();
  await tx(pool, async (c) => {
    const { rows: [inside] } = await c.query<Row>("SELECT pg_try_advisory_xact_lock($1) AS ok, pg_backend_pid() AS backend", [KEY]);
    const { rows: [other] } = await pool.query<Row>("SELECT pg_try_advisory_lock($1) AS ok, pg_backend_pid() AS backend", [KEY]);
    say("pooler", `pg_try_advisory_xact_lock(${KEY}) = ${inside.ok} inside a transaction on backend ${inside.backend}; backend ${other.backend} meanwhile gets ${other.ok}`);
    check("a transaction-level lock excludes the other connection while the transaction runs", inside.ok && !other.ok);
  });
  const { rows: [after] } = await pool.query<Row>("SELECT pg_try_advisory_xact_lock($1) AS ok, pg_backend_pid() AS backend", [KEY]);
  say("pooler", `after COMMIT the xact lock is gone: backend ${after.backend} gets ${after.ok}; safe behind a transaction pooler, but it covers one transaction, not a leadership term`);
  check("after COMMIT the transaction-level lock is released by itself", after.ok);
  await pool.end();
}

const mode = process.argv[2];
if (mode === "hold") hold();
else if (mode === "take") take(Number(process.argv[3] ?? 0), process.argv[4]);
else pooler();
