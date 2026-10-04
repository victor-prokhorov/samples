import pg from "pg";

export const PORT = 53057;
export const db = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:55477/postgres", max: 10 });
