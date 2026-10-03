// Creates the schema with its RLS policies (src/schema.sql) and seeds the shared fixtures.
import { readFileSync } from "node:fs";
import pg from "pg";
import { OWNER_URL } from "./db.js";
import { MEMBERS, USERS } from "./fixtures.js";

const db = new pg.Client(OWNER_URL);
await db.connect();
await db.query(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
for (const u of Object.values(USERS)) await db.query("INSERT INTO users VALUES ($1, $2, $3, $4)", [u.id, u.role, u.orgId, u.memberId]);
for (const m of MEMBERS) {
  await db.query("INSERT INTO members VALUES ($1, $2, $3, $4, $5)", [m.id, m.orgId, m.userId, m.name, `1 ${m.orgId} street`]);
  await db.query("INSERT INTO contributions (member_id, period, amount) VALUES ($1, '2026-08-01', 210), ($1, '2026-09-01', 215)", [m.id]);
  await db.query("INSERT INTO audit_log (member_id, actor, action) VALUES ($1, 'system', 'member:create')", [m.id]);
}
const policies = await db.query("SELECT tablename, policyname, cmd FROM pg_policies ORDER BY tablename, policyname");
console.log(`setup: ${Object.keys(USERS).length} users, ${MEMBERS.length} members (Acme, Globex, Initech), 2 contributions and 1 audit entry each`);
console.log(`setup: RLS on members, contributions, change_requests, audit_log; ${policies.rowCount} policies: ${policies.rows.map((p) => `${p.policyname} (${p.cmd})`).join(", ")}`);
await db.end();
