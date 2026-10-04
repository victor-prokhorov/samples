import pg from "pg";
import { PG } from "../src/api/db.js";

// Each end-to-end test starts with no change requests, so it does not depend on the one before it.
export async function resetChanges() {
  const c = new pg.Client({ ...PG, database: "pyramid" });
  await c.connect();
  await c.query("TRUNCATE contribution_changes RESTART IDENTITY");
  await c.end();
}
