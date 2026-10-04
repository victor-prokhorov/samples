import pg from "pg";
import { check } from "./check.js";
import { Level, db, isUniqueViolation, race, tx, withRetry } from "./db.js";

const BUYERS = 20;
const AVAILABLE = 10;

class SoldOut extends Error {}

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

async function reset() {
  await db.query("TRUNCATE tickets; DELETE FROM events; DELETE FROM products");
  await db.query("INSERT INTO products VALUES ('keyboard', $1)", [AVAILABLE]);
  await db.query("INSERT INTO events VALUES ('concert', $1)", [AVAILABLE]);
}

async function report(results: PromiseSettledResult<unknown>[], truth: string, expected: number, expect: "OVERSOLD" | "correct", claim: string) {
  const sold = results.filter((r) => r.status === "fulfilled").length;
  const soldOut = results.filter((r) => r.status === "rejected" && r.reason instanceof SoldOut).length;
  const other = results.filter((r): r is PromiseRejectedResult => r.status === "rejected" && !(r.reason instanceof SoldOut));
  const reasons = [...new Set(other.map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason))))];
  console.log(`   ${BUYERS} buyers: ${sold} told "sold", ${soldOut} told "sold out"${other.length ? `, ${other.length} failed (${reasons.join("; ")})` : ""}`);
  const { rows } = await db.query(truth);
  const actual = Number(rows[0].n);
  const exact = other.length === 0 && actual === sold && sold === expected && sold + soldOut === BUYERS;
  const verdict = sold > expected || actual > expected ? "OVERSOLD" : exact ? "correct" : "MISMATCH";
  console.log(`   database: ${actual} recorded as sold for ${expected} available -> ${verdict}`);
  check(claim, verdict === expect);
}

async function window(c: pg.Client) {
  await c.query("SELECT pg_sleep(0.1)");
}

async function buyByCount(c: pg.Client, level: Level, buyer: string, lockEvent = false) {
  return tx(c, level, async () => {
    const event = await c.query(`SELECT capacity FROM events WHERE id = 'concert'${lockEvent ? " FOR UPDATE" : ""}`);
    const sold = await c.query("SELECT count(*)::int AS n FROM tickets WHERE event_id = 'concert'");
    if (sold.rows[0].n >= event.rows[0].capacity) throw new SoldOut();
    await window(c);
    await c.query("INSERT INTO tickets (event_id, buyer) VALUES ('concert', $1)", [buyer]);
  });
}

const soldTickets = "SELECT count(*) AS n FROM tickets WHERE event_id = 'concert'";

async function main() {
  step("1. Lost update (READ COMMITTED)", "read stock, compute stock - 1 in the app, write it back: concurrent buyers overwrite each other");
  await reset();
  let results = await race(BUYERS, (c) =>
    tx(c, "READ COMMITTED", async () => {
      const { rows } = await c.query("SELECT stock FROM products WHERE id = 'keyboard'");
      if (rows[0].stock <= 0) throw new SoldOut();
      await window(c);
      await c.query("UPDATE products SET stock = $1 WHERE id = 'keyboard'", [rows[0].stock - 1]);
    }),
  );
  await report(results, `SELECT ${AVAILABLE} - stock AS n FROM products WHERE id = 'keyboard'`, AVAILABLE, "OVERSOLD", "lost update under READ COMMITTED: more buyers told \"sold\" than stock went down (oversold)");
  const stock = await db.query("SELECT stock FROM products WHERE id = 'keyboard'");
  console.log(`   stock left: ${stock.rows[0].stock} (every buyer read ${AVAILABLE} and wrote ${AVAILABLE - 1})`);
  step("2. Not needed: REPEATABLE READ catches the lost update", "the second writer of the same row gets 40001 instead of overwriting; retry the transaction and it reads the new stock");
  await reset();
  let retries = 0;
  const aborts = new Set<string>();
  const onRetry = (err: unknown) => {
    retries++;
    aborts.add(err instanceof Error ? err.message : String(err));
  };
  results = await race(BUYERS, (c) =>
    withRetry(
      () =>
        tx(c, "REPEATABLE READ", async () => {
          const { rows } = await c.query("SELECT stock FROM products WHERE id = 'keyboard'");
          if (rows[0].stock <= 0) throw new SoldOut();
          await window(c);
          await c.query("UPDATE products SET stock = $1 WHERE id = 'keyboard'", [rows[0].stock - 1]);
        }),
      onRetry,
    ),
  );
  await report(results, `SELECT ${AVAILABLE} - stock AS n FROM products WHERE id = 'keyboard'`, AVAILABLE, "correct", "REPEATABLE READ with retries sells exactly 10, no lost update");
  console.log(`   aborted with: ${[...aborts].join("; ")}`);
  console.log(`   retries this run: ${retries}`);
  check("REPEATABLE READ aborted the second writers with \"concurrent update\" (40001)", retries > 0 && [...aborts].join() === "could not serialize access due to concurrent update");
  step("3. Not needed: one atomic statement", "UPDATE ... SET stock = stock - 1 WHERE stock > 0 locks the row and re-checks the condition; READ COMMITTED is enough");
  await reset();
  results = await race(BUYERS, async (c) => {
    const { rowCount } = await c.query("UPDATE products SET stock = stock - 1 WHERE id = 'keyboard' AND stock > 0");
    if (!rowCount) throw new SoldOut();
  });
  await report(results, `SELECT ${AVAILABLE} - stock AS n FROM products WHERE id = 'keyboard'`, AVAILABLE, "correct", "one atomic UPDATE ... WHERE stock > 0 sells exactly 10");
  step("4. Not needed: a unique constraint", "20 buyers want seat A1; the check in the app is racy, but UNIQUE (event_id, seat) rejects every duplicate at insert");
  await reset();
  results = await race(BUYERS, (c, i) =>
    tx(c, "READ COMMITTED", async () => {
      const { rowCount } = await c.query("SELECT 1 FROM tickets WHERE event_id = 'concert' AND seat = 'A1'");
      if (rowCount) throw new SoldOut();
      await window(c);
      await c.query("INSERT INTO tickets (event_id, seat, buyer) VALUES ('concert', 'A1', $1)", [`buyer-${i}`]).catch((err) => {
        throw isUniqueViolation(err) ? new SoldOut() : err;
      });
    }),
  );
  await report(results, "SELECT count(*) AS n FROM tickets WHERE seat = 'A1'", 1, "correct", "UNIQUE (event_id, seat) sells seat A1 exactly once");
  step("5. Write skew (READ COMMITTED)", "capacity is a rule over many rows: count the tickets, then insert a new one; the ticket rows that would conflict do not exist yet, so all buyers pass the check");
  await reset();
  results = await race(BUYERS, (c, i) => buyByCount(c, "READ COMMITTED", `buyer-${i}`));
  await report(results, soldTickets, AVAILABLE, "OVERSOLD", "write skew happens under READ COMMITTED: oversold");
  step("6. Write skew (REPEATABLE READ)", "a snapshot makes each transaction's reads stable, but they still do not see each other's inserts: same oversell");
  await reset();
  results = await race(BUYERS, (c, i) => buyByCount(c, "REPEATABLE READ", `buyer-${i}`));
  await report(results, soldTickets, AVAILABLE, "OVERSOLD", "write skew happens under REPEATABLE READ too: oversold");
  step("7. Needed: SERIALIZABLE, with retries", "Postgres tracks read/write dependencies (SSI) and aborts one side of each conflict with 40001; the app retries the whole transaction");
  await reset();
  retries = 0;
  aborts.clear();
  results = await race(BUYERS, (c, i) => withRetry(() => buyByCount(c, "SERIALIZABLE", `buyer-${i}`), onRetry));
  await report(results, soldTickets, AVAILABLE, "correct", "SERIALIZABLE with retries prevents the write skew: exactly 10 sold");
  console.log(`   aborted with: ${[...aborts].join("; ")}`);
  console.log(`   retries this run: ${retries}`);
  check("SERIALIZABLE aborted one side of each conflict with \"read/write dependencies\" (40001)", retries > 0 && [...aborts].join() === "could not serialize access due to read/write dependencies among transactions");
  step("8. Alternative: lock the parent row", "SELECT ... FROM events FOR UPDATE turns the many-row rule into a one-row lock; READ COMMITTED, no retries, but buyers queue");
  await reset();
  results = await race(BUYERS, (c, i) => buyByCount(c, "READ COMMITTED", `buyer-${i}`, true));
  await report(results, soldTickets, AVAILABLE, "correct", "locking the parent row under READ COMMITTED also sells exactly 10");
  const { rows } = await db.query("SELECT count(*)::int AS tickets, count(DISTINCT buyer)::int AS buyers FROM tickets WHERE event_id = 'concert'");
  check("the last scenario left exactly 10 tickets for 10 distinct buyers", rows[0].tickets === 10 && rows[0].buyers === 10);
  await db.end();
}

main();
