import { check } from "./check.js";
import { closeAll, orchestratorDb } from "./db.js";
import { clock, runSaga } from "./orchestrator.js";

const POLL_MS = 5000;

async function main() {
  console.log(`\n## waker (pid ${process.pid})`);
  console.log(`   concept: a loop polls the saga log every ${POLL_MS / 1000}s, claims sagas whose wake_at has passed, and drives them on from the step after the timer`);
  const claimed: string[] = [];
  for (;;) {
    const due = await orchestratorDb.query(
      "UPDATE sagas SET state = 'running', updated_at = now() WHERE state = 'waiting' AND wake_at <= now() RETURNING id, round(extract(epoch FROM now() - wake_at)::numeric, 1) AS late",
    );
    for (const r of due.rows) {
      console.log(`   ${clock()} [${r.id}] due, claimed (waiting -> running, ${r.late}s after wake_at because of the poll interval)`);
      claimed.push(r.id);
      await runSaga(r.id);
    }
    const waiting = await orchestratorDb.query(
      "SELECT id, ceil(extract(epoch FROM wake_at - now()))::int AS in_sec FROM sagas WHERE state = 'waiting' ORDER BY wake_at",
    );
    if (!waiting.rowCount) {
      const e = await orchestratorDb.query("SELECT state, wake_at <= updated_at AS after_wake FROM sagas WHERE id = 'order-E'");
      check("this waker claimed order-E once it was due and completed it", claimed.join() === "order-E" && e.rows[0].state === "completed" && e.rows[0].after_wake === true);
      console.log(`   ${clock()} no saga waiting, waker exits`);
      break;
    }
    console.log(`   ${clock()} tick: ${waiting.rows.map((r) => `${r.id} due in ${r.in_sec}s`).join(", ")}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  await closeAll();
}

main();
