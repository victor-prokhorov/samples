import { check } from "./check.js";
import { closeAll, orchestratorDb, paymentsDb } from "./db.js";
import { runSaga } from "./orchestrator.js";

async function main() {
  console.log("\n## 5. Recovery");
  console.log("   concept: on restart, the orchestrator reloads unfinished sagas from its log and continues; steps are idempotent (keyed by saga id), so re-running chargePayment does not charge twice");
  const { rows } = await orchestratorDb.query("SELECT id, state, step FROM sagas WHERE state IN ('running', 'compensating') ORDER BY id");
  const charged = await paymentsDb.query("SELECT 1 FROM charges WHERE saga_id = 'order-D'");
  check("after the crash the saga log says order-D is at step 1, yet its charge exists", rows.map((r) => `${r.id}:${r.state}:${r.step}`).join() === "order-D:running:1" && charged.rowCount === 1);
  for (const r of rows) {
    console.log(`   [${r.id}] found ${r.state} at step ${r.step}, resuming`);
    await runSaga(r.id);
  }
  const d = await orchestratorDb.query("SELECT state FROM sagas WHERE id = 'order-D'");
  const charges = await paymentsDb.query("SELECT count(*)::int AS n FROM charges WHERE saga_id = 'order-D'");
  check("order-D completed after the restart, charged exactly once although chargePayment ran twice", d.rows[0].state === "completed" && charges.rows[0].n === 1);
  await closeAll();
}

main();
