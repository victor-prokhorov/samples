import pg from "pg";

export const url = "postgres://postgres:postgres@localhost:55451/postgres";

// One pool per server process; the global survives module reloads in `next dev`.
const g = globalThis as unknown as { pool?: pg.Pool };
export const pool = (g.pool ??= new pg.Pool({ connectionString: url, max: 5 }));
