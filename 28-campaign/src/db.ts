import pg from "pg";

export const db = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:55458/postgres" });

export const SMTP_PORT = 52528;
export const YEAR = 2025;
