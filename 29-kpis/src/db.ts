import pg from "pg";

export const PORT = 53039;

export const db = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:55459/postgres", max: 20 });
