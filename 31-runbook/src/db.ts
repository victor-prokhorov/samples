import pg from "pg";

export const PORT = 53041;

export const url = "postgres://postgres:postgres@localhost:55461/postgres";

export const db = new pg.Pool({ connectionString: url });
