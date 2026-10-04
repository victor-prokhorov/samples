import pg from "pg";

export const db = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:55478/postgres", max: 10 });
