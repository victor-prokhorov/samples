import { orchestratorDb } from "./db.js";
import { Order, inventory, payments, shipping } from "./services.js";

type Step = { name: string; action: (sagaId: string, o: Order) => Promise<void>; compensate?: (sagaId: string) => Promise<void> };

const STEPS: Step[] = [
  { name: "reserveInventory", action: inventory.reserve, compensate: inventory.release },
  { name: "chargePayment", action: payments.charge, compensate: payments.refund },
  { name: "createShipment", action: shipping.create },
];

async function save(id: string, state: string, step: number, error?: string) {
  await orchestratorDb.query("UPDATE sagas SET state = $2, step = $3, error = COALESCE($4, error), updated_at = now() WHERE id = $1", [id, state, step, error ?? null]);
}

export async function startSaga(id: string, input: Order, crashAfter?: string) {
  await orchestratorDb.query("INSERT INTO sagas (id, input, state, step) VALUES ($1, $2, 'running', 0)", [id, input]);
  console.log(`   [${id}] started ${JSON.stringify(input)}`);
  await runSaga(id, crashAfter);
}

export async function runSaga(id: string, crashAfter?: string) {
  const { rows } = await orchestratorDb.query("SELECT input, state, step FROM sagas WHERE id = $1", [id]);
  const input: Order = rows[0].input;
  let { state, step } = rows[0] as { state: string; step: number };
  while (state === "running" && step < STEPS.length) {
    const s = STEPS[step];
    try {
      await s.action(id, input);
      console.log(`   [${id}] step ${step + 1} ${s.name}: ok`);
      if (crashAfter === s.name) {
        console.log(`   [${id}] CRASH after ${s.name} ran, before the saga log recorded it`);
        process.exit(1);
      }
      step++;
      await save(id, state, step);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`   [${id}] step ${step + 1} ${s.name}: FAILED (${message}) -> compensate ${step} completed step(s)`);
      state = "compensating";
      await save(id, state, step, message);
    }
  }
  while (state === "compensating" && step > 0) {
    const s = STEPS[step - 1];
    await s.compensate?.(id);
    console.log(`   [${id}] compensate ${s.name}: ok`);
    step--;
    await save(id, state, step);
  }
  const final = state === "running" ? "completed" : "aborted";
  await save(id, final, step);
  console.log(`   [${id}] ${final}`);
}
