import pg from "pg";

export const ORIGIN_PORT = 53054;
export const CACHE_PORT = 53154;
export const ORIGIN = `http://localhost:${ORIGIN_PORT}`;
export const CACHE = `http://localhost:${CACHE_PORT}`;
export const DATABASE_URL = "postgres://postgres:postgres@localhost:55474/postgres";

export const db = new pg.Pool({ connectionString: DATABASE_URL, max: 20 });
