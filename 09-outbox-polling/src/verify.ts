import pg from "pg";
import { check } from "./check.js";
import { PG_URL } from "./config.js";

// State checks between the relay passes: `verify crashed` after pass 1 dies, `verify drained` after pass 2.
async function main() {
  const db = new pg.Client(PG_URL);
  await db.connect();
  const { rows } = await db.query("SELECT count(*)::int AS rows, count(published_at)::int AS published FROM outbox");
  if (process.argv[2] === "crashed") check("after the crash both rows are still unpublished: the claim transaction died with the process", rows[0].rows === 2 && rows[0].published === 0);
  else check("after pass 2 every outbox row is marked published", rows[0].rows === 2 && rows[0].published === 2);
  await db.end();
}

main();
