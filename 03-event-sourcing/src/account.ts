export type AccountEvent =
  | { type: "AccountOpened"; owner: string }
  | { type: "MoneyDeposited"; amount: number }
  | { type: "MoneyWithdrawn"; amount: number };

export type Account = { owner: string; balance: number; version: number };

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

export function rehydrate(events: AccountEvent[]): Account {
  return events.reduce((s, e) => ({ ...evolve(s, e), version: s.version + 1 }), { owner: "", balance: 0, version: 0 });
}

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
