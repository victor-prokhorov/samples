import pg from "pg";

export const PORT = 53050;
export const DATABASE_URL = "postgres://postgres:postgres@localhost:55470/postgres";

export const db = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });
