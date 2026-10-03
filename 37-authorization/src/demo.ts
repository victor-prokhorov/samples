// The story: scattered role checks that disagree with each other, one policy instead, a matrix generated
// from it, the same rules in Postgres RLS, and a bug in the code that only the database catches.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { Server } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import pg from "pg";
import { policyApp, guard } from "./app.js";
import { dbAllows, httpCall } from "./cells.js";
import { OWNER_URL, PORT, setUser } from "./db.js";
import { USERS } from "./fixtures.js";
import { type Cell, html, markdown, matrix, rowLabel } from "./matrix.js";
import { ACTIONS, RELATIONSHIPS, ROLES, can } from "./policy.js";
import { sprinkledApp } from "./sprinkled.js";

function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
}

const owner = new pg.Pool({ connectionString: OWNER_URL, max: 4 });
const base = `http://localhost:${PORT}`;
const listen = (s: Server) => new Promise<void>((ok) => s.listen(PORT, ok));
// fetch keeps idle keep-alive sockets; close them and give the client a moment to see it, so the next
// server on the same port is not sent a request over a socket the previous one closed.
const shut = async (s: Server) => {
  await new Promise<void>((ok) => (s.close(() => ok()), s.closeAllConnections()));
  await sleep(100);
};
const cells = matrix();
const live = cells.filter((c) => c.verdict !== "n/a");
const say = (c: Cell) => `${c.subject.id.padEnd(4)} (${c.role}) ${rowLabel(c.row)} on ${c.rel} (${c.target!.id})`;

// Every cell over HTTP: what did the server do, and what does the policy say it should have done?
async function probe(label: string) {
  const wrong: string[] = [];
  for (const c of live) {
    const r = await httpCall(owner, c, base);
    if (r.allowed !== (c.verdict === "allow")) wrong.push(`${say(c)}: ${r.method} ${r.path} -> ${r.status}, policy says ${c.verdict}`);
  }
  console.log(`   ${label}: ${live.length} requests, one per matrix cell; ${live.length - wrong.length} answered as the policy says, ${wrong.length} did not`);
  for (const w of wrong) console.log(`     WRONG ${w}`);
  return wrong;
}

const roleChecks = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8").split("\n").filter((l) => /\.role [!=]==/.test(l)).length;

// ---------------------------------------------------------------------------------------------------------

step(
  "1. Before: role checks sprinkled in handlers",
  "each handler decides on its own, by role, in its own words; the database checks nothing (the app connects as the table owner)",
);
console.log(`   src/sprinkled.ts: 8 routes, ${roleChecks("./sprinkled.ts")} lines comparing user.role, 1 route with no check at all`);
const sprinkled = sprinkledApp(owner);
await listen(sprinkled);
const wrongBefore = await probe("sprinkled app");
await shut(sprinkled);
check(wrongBefore.length === 7, "7 cells where the sprinkled handlers disagree with the policy");
check(wrongBefore.filter((w) => w.includes("/contributions -> 200") && w.includes("contribution:read")).length === 3, "the route with no check lets a member read other members' contributions, and an Acme admin read Globex's");
check(wrongBefore.some((w) => w.includes("sam ") && w.includes("requested by me") && w.includes("-> 200")), "staff approved a change they requested themselves: no four eyes");

step(
  "2. One policy: can(user, action, resource)",
  "RBAC: a role grants a list of actions; ABAC: a condition on user and resource narrows each one (own record, same organisation, requested by me, pending); no rule means deny",
);
const any = live[0].resource!;
const contractor = { ...USERS.ana, role: "contractor" };
const allowedToContractor = cells.filter((c) => c.resource && can({ ...c.subject, role: "contractor" }, c.row.action, c.resource)).length;
console.log(`   unknown role "contractor": ${allowedToContractor} of ${live.length} cells allowed`);
console.log(`   no user: can(null, "member:read", ...) = ${can(null, "member:read", any)}; unknown action "member:delete" = ${can(USERS.sam, "member:delete", { ...any, type: "member" })}`);
console.log(`   action on the wrong kind of resource: can(sam, "member:read", <a contribution>) = ${can(USERS.sam, "member:read", { ...any, type: "contribution" })}`);
let refused = "";
try {
  guard(owner, [{ method: "DELETE", path: "/members/:id" } as never]);
} catch (e) {
  refused = (e as Error).message;
}
console.log(`   a route registered without an action: ${refused}`);
check(allowedToContractor === 0 && !can(contractor, "member:read", any), "an unknown role gets nothing");
check(!can(null, "member:read", any) && !can(USERS.sam, "member:delete", { ...any, type: "member" }), "no user, or an action nobody was granted: denied");
check(refused.includes("deny by default"), "a route without a declared action refuses to start");

step(
  "3. The permission matrix, generated from the policy",
  "roles x actions x relationship of the record to the user, each cell answered by can(); committed as Markdown and HTML so a reviewer reads the policy as a table",
);
mkdirSync("out", { recursive: true });
writeFileSync("out/matrix.md", markdown(cells));
writeFileSync("out/matrix.html", html(cells));
const n = (v: string) => cells.filter((c) => c.verdict === v).length;
console.log(`   ${ROLES.length} roles x ${new Set(cells.map((c) => rowLabel(c.row))).size} actions x ${RELATIONSHIPS.length} relationships = ${cells.length} cells: ${n("allow")} allow, ${n("deny")} deny, ${n("n/a")} cannot occur; wrote out/matrix.md, out/matrix.html`);
console.log(`   ${"".padEnd(16)}${"action".padEnd(52)}${RELATIONSHIPS.map((r) => r.padEnd(20)).join("")}`);
for (const role of ROLES)
  for (const label of [...new Set(cells.map((c) => rowLabel(c.row)))]) {
    const cs = cells.filter((c) => c.role === role && rowLabel(c.row) === label);
    console.log(`   ${role.padEnd(16)}${label.padEnd(52)}${cs.map((c) => (c.verdict === "n/a" ? "-" : c.verdict).padEnd(20)).join("")}`);
  }
check(ACTIONS.every((a) => cells.some((c) => c.row.action === a)), "every action is in the matrix");
check(n("allow") === 19 && n("deny") === 44, "19 allowed and 44 denied cells (the expectations in test/matrix.test.ts list each one)");

step(
  "4. After: every route goes through the policy",
  "each route declares its action and how to load its resource's attributes; one wrapper calls can() before any handler runs (403 with the rule that failed)",
);
console.log(`   src/app.ts: 8 routes, ${roleChecks("./app.ts")} lines comparing user.role; every route names one of ${ACTIONS.length} actions`);
const disagreements: string[] = [];
const fixed = policyApp(owner, { onDisagreement: (w) => disagreements.push(w) });
await listen(fixed.server);
const wrongAfter = await probe("policy app");
await shut(fixed.server);
await fixed.close();
check(wrongAfter.length === 0 && roleChecks("./app.ts") === 0, "the policy app answers every cell as the matrix says, with no role check in any handler");
check(disagreements.length === 0, "and the database never had to refuse what the code allowed");

step(
  "5. The same rules in Postgres RLS, checked cell by cell",
  "each cell's statement runs as the `app` role with the user's id, role, organisation and member record set for the transaction; the transaction is rolled back after each cell",
);
let agree = 0;
const disagree: string[] = [];
for (const c of live) {
  const db = await dbAllows(owner, c);
  if (db === (c.verdict === "allow")) agree++;
  else disagree.push(`${say(c)}: code ${c.verdict}, database ${db ? "allow" : "deny"}`);
}
console.log(`   ${agree} of ${live.length} cells: code and database agree`);
for (const d of disagree) console.log(`     DISAGREE ${d}`);
check(agree === live.length, "code and database agree on every cell of the matrix");
// Two raw looks at what RLS does: a read is filtered (no error, no row), a write is refused (an error).
const c = await owner.connect();
await c.query("BEGIN; SET LOCAL ROLE app");
await setUser(c, USERS.ana);
const seen = await c.query("SELECT id FROM members ORDER BY id");
console.log(`   as ana: SELECT id FROM members -> ${seen.rows.map((r) => r.id).join(", ")} (RLS filters, the query does not fail)`);
await c.query("ROLLBACK");
await c.query("BEGIN");
const { rows: crRows } = await c.query("INSERT INTO change_requests (member_id, requested_by, field, value) VALUES ('m-gil', 'sam', 'address', 'x') RETURNING id");
await c.query("SET LOCAL ROLE app");
await setUser(c, USERS.sam);
let rlsError = "";
try {
  await c.query("UPDATE change_requests SET status = 'approved', approved_by = 'sam' WHERE id = $1", [crRows[0].id]);
} catch (e) {
  rlsError = `${(e as { code: string }).code} ${(e as Error).message}`;
}
console.log(`   as sam, approving the request sam filed -> ${rlsError}`);
await c.query("ROLLBACK");
c.release();
check(seen.rows.length === 1 && rlsError.startsWith("42501"), "RLS filters reads and refuses writes");

step(
  "6. A bug only RLS catches",
  "the policy is right and the matrix passes; the bug is in the code that loads the resource's attributes: it takes the requester from the member the request is about. Self-service requests hide it; a request staff file on a member's behalf shows it",
);
const scenario = async (label: string, opts: Parameters<typeof policyApp>[1], approver = "sam") => {
  const app = policyApp(owner, { ...opts, onDisagreement: (w) => disagreements.push(w) });
  await listen(app.server);
  const post = async (path: string, user: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method: "POST", headers: { "x-user": user, "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };
  const filed = await post("/members/m-gil/change-requests", "sam", { field: "bank_account", value: "FR76 0000 0000 0000" });
  const approved = await post(`/change-requests/${filed.body.id}/approve`, approver);
  const row = (await owner.query("SELECT id, member_id, requested_by, status, approved_by FROM change_requests WHERE id = $1", [filed.body.id])).rows[0];
  await shut(app.server);
  await app.close();
  console.log(`   ${label}`);
  console.log(`     sam files a bank account change for Gil -> ${filed.status}; ${approver} approves it -> ${approved.status} ${JSON.stringify(approved.body)}`);
  console.log(`     change_requests row: ${JSON.stringify(row)}`);
  return { approved, row };
};
disagreements.length = 0;
const noRls = await scenario("buggy loader, database not enforcing (connected as owner, like the sprinkled app):", { requesterBug: true, rls: false });
check(noRls.approved.status === 200 && noRls.row.status === "approved" && noRls.row.approved_by === noRls.row.requested_by, "without RLS the bug approves a change by its own requester: four eyes silently broken");
const withRls = await scenario("buggy loader, RLS on:", { requesterBug: true });
console.log(`     logged: ${disagreements[0]}`);
check(withRls.approved.status === 403 && withRls.row.status === "pending" && disagreements.length === 1, "with RLS the same bug is refused by the database, the request stays pending, and the disagreement is logged");
check(cells.every((x) => x.verdict === matrix().find((y) => y.role === x.role && y.row === x.row && y.rel === x.rel)!.verdict), "the matrix is unchanged: a policy test cannot see a bug in the loader");
const fixedCode = await scenario("loader fixed, RLS on:", {});
check(fixedCode.approved.status === 403 && String(fixedCode.approved.body.why).includes("not requested by me"), "with the loader fixed, the code refuses first, naming the four-eyes rule");
const otherStaff = await scenario("loader fixed, RLS on, a second member of staff approves:", {}, "sky");
check(otherStaff.approved.status === 200 && otherStaff.row.approved_by === "sky" && otherStaff.row.requested_by === "sam", "a different member of staff can approve it");
check(disagreements.length === 1, "no other disagreement between code and database");

await owner.end();
