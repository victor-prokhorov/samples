/**
 * Domain events (DDD, Evans): immutable facts about something that already happened, named in the past tense
 * in the ubiquitous language of the domain. They are the only thing persisted; state is derived from them.
 */
export type AccountEvent =
  | { type: "AccountOpened"; owner: string }
  | { type: "MoneyDeposited"; amount: number }
  | { type: "MoneyWithdrawn"; amount: number };

/**
 * Aggregate state (DDD): the in-memory model of one aggregate instance, the Account, which is the consistency
 * boundary. One aggregate instance = one event stream. `version` is the stream revision (events applied so far),
 * later used as the expected version for optimistic concurrency.
 */
export type Account = { owner: string; balance: number; version: number };

/**
 * Evolve (Decider pattern, Chassaing), a.k.a. "apply" / "when" / event handler on the aggregate (Young, CQRS/ES).
 * Pure function (state, event) -> state. Never validates and never rejects: an event is a fact that already
 * happened, so it must always be applicable, including very old ones on replay.
 */
export function evolve(state: Account, event: AccountEvent): Account {
  switch (event.type) {
    case "AccountOpened":
      return { ...state, owner: event.owner };
    case "MoneyDeposited":
      return { ...state, balance: state.balance + event.amount };
    case "MoneyWithdrawn":
      return { ...state, balance: state.balance - event.amount };
  }
}

/**
 * Rehydration, a.k.a. "loading the aggregate" / "replaying the stream": a left fold of `evolve` over the stream,
 * starting from the initial state (Decider: `initialState`). Write side only; not a projection.
 */
export function rehydrate(events: AccountEvent[]): Account {
  return events.reduce((s, e) => ({ ...evolve(s, e), version: s.version + 1 }), { owner: "", balance: 0, version: 0 });
}

/**
 * Command handlers, the Decider's `decide` function: (state, command) -> events. Each one enforces the aggregate's
 * invariants (DDD business rules) against the rehydrated state, then either rejects the command (throws, nothing
 * written) or returns the new domain events. Pure: no I/O, no mutation.
 *
 * BDD tie-in: this is what event-sourced tests are written against, as
 * Given (past events) / When (command) / Then (new events or a rejection).
 */
export function open(state: Account, owner: string): AccountEvent[] {
  if (state.version > 0) throw new Error("account already open");
  return [{ type: "AccountOpened", owner }];
}

export function deposit(state: Account, amount: number): AccountEvent[] {
  if (state.version === 0) throw new Error("account not open");
  if (amount <= 0) throw new Error("amount must be positive");
  return [{ type: "MoneyDeposited", amount }];
}

export function withdraw(state: Account, amount: number): AccountEvent[] {
  if (state.version === 0) throw new Error("account not open");
  if (amount <= 0) throw new Error("amount must be positive");
  if (amount > state.balance) throw new Error(`insufficient funds: balance ${state.balance}, asked ${amount}`);
  return [{ type: "MoneyWithdrawn", amount }];
}
