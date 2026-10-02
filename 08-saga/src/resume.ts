import { closeAll, orchestratorDb } from "./db.js";
import { runSaga } from "./orchestrator.js";

async function main() {
  console.log("\n## 5. Recovery");
  console.log("   concept: on restart, the orchestrator reloads unfinished sagas from its log and continues; steps are idempotent (keyed by saga id), so re-running chargePayment does not charge twice");
  const { rows } = await orchestratorDb.query("SELECT id, state, step FROM sagas WHERE state IN ('running', 'compensating') ORDER BY id");
  for (const r of rows) {
    console.log(`   [${r.id}] found ${r.state} at step ${r.step}, resuming`);
    await runSaga(r.id);
  }
  await closeAll();
}

main();
