import { readFileSync } from "node:fs";
import { pool } from "./db.js";

await pool.query(readFileSync("sql/legacy.sql", "utf8"));
await pool.query(`
  CREATE TABLE IF NOT EXISTS cases (
    id INT PRIMARY KEY,
    kind TEXT NOT NULL,
    salary NUMERIC(12, 2) NOT NULL,
    birth_date DATE NOT NULL,
    joined_on DATE NOT NULL,
    period DATE NOT NULL CHECK (extract(day FROM period) = 1),
    legacy NUMERIC(12, 2),
    booklet NUMERIC(12, 2),
    rewrite NUMERIC(12, 2),
    explained_by TEXT,
    verdict TEXT
  )`);
console.log("setup: legacy_monthly_contribution() (the PL/pgSQL as found), cases (inputs, legacy output, rewrite outputs, verdict)");
await pool.end();
