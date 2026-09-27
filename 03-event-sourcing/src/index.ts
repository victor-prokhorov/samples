import { randomUUID } from "node:crypto";
import { Account, AccountEvent, deposit, open, rehydrate, withdraw } from "./account.js";
import { ConcurrencyError, append, migrate, pool, readStream } from "./store.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

/**
 * Application service / command handler pipeline (DDD + CQRS): load (read stream) -> rehydrate (fold) ->
 * decide (enforce invariants, produce events) -> append with expected version. The only side effect is the append.
 */
async function handle(streamId: string, decide: (s: Account) => AccountEvent[]) {
  const history = await readStream<AccountEvent>(streamId);
  const state = rehydrate(history.map((h) => h.event));
  const events = decide(state);
  await append(streamId, state.version, events);
  console.log(`   v${state.version} balance=${state.balance} -> appended ${events.map((e) => JSON.stringify(e)).join(", ")}`);
}

async function main() {
  await migrate();
  const id = `account-${randomUUID()}`;
  console.log(`stream: ${id}`);
  step("1. Commands produce events", "a command loads the stream, folds it into state, validates, and appends new facts; no row is ever updated");
  await handle(id, (s) => open(s, "alice"));
  await handle(id, (s) => deposit(s, 100));
  await handle(id, (s) => withdraw(s, 30));
  step("2. Invariants are checked against rebuilt state", "withdraw 500 with balance 70 must be rejected, and nothing is appended");
  await handle(id, (s) => withdraw(s, 500)).catch((err) => console.log(`   rejected: ${err instanceof Error ? err.message : String(err)}`));
  step("3. Optimistic concurrency", "two writers read the same version; the first append wins, the second hits UNIQUE(stream_id, version)");
  const stale = rehydrate((await readStream<AccountEvent>(id)).map((h) => h.event));
  console.log(`   writer A and writer B both read v${stale.version}`);
  await append(id, stale.version, deposit(stale, 1));
  console.log(`   writer A appended v${stale.version + 1}`);
  await append(id, stale.version, deposit(stale, 1)).catch((err) =>
    console.log(`   writer B: ConcurrencyError=${err instanceof ConcurrencyError} (${err instanceof Error ? err.message : String(err)})`),
  );
  step("4. The stream is the source of truth", "the full history is stored; current state is only a left fold over it");
  const history = await readStream<AccountEvent>(id);
  console.table(history.map((h) => ({ v: h.version, ...h.event })));
  console.log("   current state:", rehydrate(history.map((h) => h.event)));
  step("5. Time travel", "replay a prefix of the stream to get the state at any past version");
  console.log("   as of v3:", rehydrate(history.slice(0, 3).map((h) => h.event)));
  console.log("   as of v1:", rehydrate(history.slice(0, 1).map((h) => h.event)));
  step("6. Projections (read models)", "any new view can be derived later by replaying the same events, e.g. total deposited");
  // Projection / read model (CQRS read side): a query-shaped view folded from events, possibly across many streams.
  const deposited = history.reduce((sum, h) => (h.event.type === "MoneyDeposited" ? sum + h.event.amount : sum), 0);
  console.log(`   total deposited = ${deposited}`);
  await pool.end();
}

main();
