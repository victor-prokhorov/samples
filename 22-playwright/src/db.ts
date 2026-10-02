import pg from "pg";

export const PORT = 53032;
export const TEMPLATE = "portal_template";

export const url = (database: string) => `postgres://postgres:postgres@localhost:55452/${database}`;

export const admin = () => new pg.Pool({ connectionString: url("postgres"), max: 1 });

export async function cloneTemplate(database: string) {
  const a = admin();
  try {
    await a.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await a.query(`CREATE DATABASE ${database} TEMPLATE ${TEMPLATE}`);
  } finally {
    await a.end();
  }
}

export async function dropDatabase(database: string) {
  const a = admin();
  try {
    await a.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  } finally {
    await a.end();
  }
}
