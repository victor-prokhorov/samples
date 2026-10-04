// Creates the schema with its RLS policies (src/schema.sql) and seeds: three organisations, 24 members with six months
// of contributions, the IdP group to role mappings, one pending change filed by staff on a member's behalf (the
// four-eyes case), and four weeks of usage history so the KPI page has something to measure.
import { readFileSync } from "node:fs";
import pg from "pg";
import { OWNER_URL } from "./config";
import { withCheckDigits } from "./lib/bank";

const db = new pg.Client(OWNER_URL);
await db.connect();
await db.query(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));

const ORGS = { acme: "Acme", globex: "Globex", initech: "Initech" };
const NAMES: [string, keyof typeof ORGS][] = [
  ...["Ana Martin", "Ben Dubois", "Chloé Bernard", "David Laurent", "Emma Leroy", "Farid Haddad", "Grace Thompson", "Hugo Moreau", "Inès Garcia", "Jonas Weber", "Katia Rossi", "Liam Walsh"].map((n) => [n, "acme"] as [string, "acme"]),
  ...["Gil Novak", "Hana Sato", "Ivan Petrov", "Julia Costa", "Karim Benali", "Lena Fischer", "Marco Bianchi", "Nora Lindqvist"].map((n) => [n, "globex"] as [string, "globex"]),
  ...["Ivo Kovač", "Olga Nowak", "Paul Girard", "Rosa Jiménez"].map((n) => [n, "initech"] as [string, "initech"]),
];
const members = NAMES.map(([name, org], i) => ({
  id: `M${String(i + 1).padStart(4, "0")}`,
  org,
  name,
  sub: name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[^a-z]/g, ""),
  iban: withCheckDigits("FR", `3000600001${String(40_000_000 + i * 7_919).padStart(11, "0")}${String(10 + ((i * 13) % 89)).padStart(2, "0")}`),
}));

for (const [id, name] of Object.entries(ORGS)) await db.query("INSERT INTO organisations VALUES ($1, $2)", [id, name]);
await db.query(`INSERT INTO role_mappings VALUES ('portal-members', 'member', NULL), ('acme-hr', 'employer_admin', 'acme'), ('globex-hr', 'employer_admin', 'globex'), ('portal-staff', 'staff', NULL)`);
for (const [i, m] of members.entries()) {
  await db.query("INSERT INTO members VALUES ($1, $2, $3, $3, $4)", [m.id, m.org, m.name, m.iban]);
  const employee = 150 + ((i * 37) % 120) + 0.5 * (i % 2);
  await db.query(
    `INSERT INTO contributions SELECT $1, date '2026-04-01' + make_interval(months => g), $2::numeric + 2.5 * g, round(($2::numeric + 2.5 * g) * 1.5, 2) FROM generate_series(0, 5) g`,
    [m.id, employee],
  );
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const event = (sub: string, member: string | null, session: string, name: string, at: Date, props: object = {}) =>
  db.query("INSERT INTO events (at, user_sub, member_id, session, name, props) VALUES ($1, $2, $3, $4, $5, $6)", [at, sub, member, session, name, JSON.stringify(props)]);

// Four weeks of history. Logins by 13 of the 24 members (not Ana or Ben, who sign in during the demo).
const active = members.slice(2, 15);
for (const [i, m] of active.entries()) for (let k = 0; k <= i % 3; k++) await event(m.sub, m.id, `h-login-${i}-${k}`, "login", hoursAgo(24 * (1 + ((i * 5 + k * 9) % 26)) + 3));
// 20 bank-form sessions: 17 sent a request (4 of them after a validation error), 3 gave up (1 after an error).
for (let j = 0; j < 20; j++) {
  const m = active[j % active.length];
  const start = hoursAgo(24 * (2 + ((j * 7) % 25)) + 10);
  const at = (min: number) => new Date(start.getTime() + min * 60_000);
  const session = `h-bank-${j}`;
  await event(m.sub, m.id, session, "bank_change_started", start);
  if (j % 5 === 0 || j === 18) await event(m.sub, m.id, session, "bank_change_rejected", at(1), { fields: ["iban"], reasons: ["errors.iban.checksum"] });
  if (j >= 17) continue;
  await event(m.sub, m.id, session, "bank_change_submitted", at(2));
  // Approved by staff after a delay: 15 within the 3-day service level, 2 after it.
  const delayHours = j === 4 ? 90 : j === 11 ? 120 : 2 + ((j * 11) % 60);
  const approver = j % 2 ? "sam" : "sky";
  await db.query("INSERT INTO change_requests (member_id, requested_by, field, value, status, approved_by, created_at, approved_at) VALUES ($1, $2, 'bank_account', $3, 'approved', $4, $5, $6)", [
    m.id,
    m.sub,
    JSON.stringify({ holder: m.name, iban: m.iban }),
    approver,
    at(2),
    new Date(at(2).getTime() + delayHours * 3_600_000),
  ]);
}

// Staff member Sam filed a change on Gil's behalf (Gil phoned in): another member of staff has to approve it.
const gil = members.find((m) => m.sub === "gil")!;
await db.query("INSERT INTO change_requests (member_id, requested_by, field, value, created_at) VALUES ($1, 'sam', 'bank_account', $2, $3)", [
  gil.id,
  JSON.stringify({ holder: gil.name, iban: withCheckDigits("DE", "370400440532013000") }),
  hoursAgo(20),
]);

const count = async (sql: string) => Number((await db.query(sql)).rows[0].count);
const policies = await db.query("SELECT policyname FROM pg_policies ORDER BY tablename, policyname");
console.log(`setup: ${Object.keys(ORGS).length} organisations, ${members.length} members (Acme 12, Globex 8, Initech 4), ${await count("SELECT count(*) FROM contributions")} contributions`);
console.log(`setup: ${await count("SELECT count(*) FROM events")} usage events and ${await count("SELECT count(*) FROM change_requests WHERE status = 'approved'")} approved changes over the last four weeks; 1 pending change, filed by staff (sam) for ${gil.name}`);
console.log(`setup: RLS on members, contributions, change_requests, events; ${policies.rowCount} policies: ${policies.rows.map((p) => p.policyname).join(", ")}`);
await db.end();
