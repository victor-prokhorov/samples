import pg from "pg";

pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export const pool = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:55454/postgres" });
