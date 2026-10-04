import pg from "pg";

export const PORT = 53053;

// dates stay 'YYYY-MM-DD' strings: no time zone shift between Postgres, Node and the export files
pg.types.setTypeParser(1082, (v) => v);

export const db = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:55473/postgres", max: 10 });

// A fixed "now", so the seed, the deadlines, the retention cut-offs and the committed export are reproducible.
// In production this is the real clock.
export const clock = {
  t: Date.parse("2026-10-03T09:00:00Z"),
  now: () => new Date(clock.t),
  advance: (ms: number) => void (clock.t += ms),
};
