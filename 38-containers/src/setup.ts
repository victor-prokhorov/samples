// Creates the members table the app reads: 30 members across Acme, Globex and Initech.
import pg from "pg";
import { DB_URL_HOST } from "./config.js";

const db = new pg.Client({ connectionString: DB_URL_HOST });
await db.connect();
await db.query(`
  DROP TABLE IF EXISTS members;
  CREATE TABLE members (id serial PRIMARY KEY, employer text NOT NULL, name text NOT NULL);
  INSERT INTO members (employer, name)
  SELECT (ARRAY['Acme', 'Globex', 'Initech'])[1 + i % 3], 'Member ' || i FROM generate_series(1, 30) AS i;
`);
const { rows } = await db.query("SELECT employer, count(*)::int AS n FROM members GROUP BY 1 ORDER BY 1");
console.log(`setup: members table ready (${rows.map((r) => `${r.employer} ${r.n}`).join(", ")})`);
await db.end();
