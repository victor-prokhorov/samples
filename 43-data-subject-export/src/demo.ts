import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { DEMO_PASSWORD, newToken, tokenHash } from "./auth.js";
import { PORT, clock, db } from "./db.js";
import { addMonths, dueOn, extendedDueOn } from "./deadline.js";
import { InventoryIncomplete, buildExport, exported } from "./export.js";
import { checkInventory } from "./inventory-check.js";
import { inventory, notPersonal } from "./inventory.js";
import { eligibility, purge } from "./retention.js";
import { startServer } from "./server.js";

let failed = 0;
function check(label: string, cond: boolean) {
  console.log(`   ${cond ? "check ok" : "CHECK FAILED"}: ${label}`);
  if (!cond) (failed++, (process.exitCode = 1));
}
function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}
const one = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0];

const server = await startServer(PORT, db, clock);
const token = newToken();
const cookie = { cookie: `sid=${token}` };
const call = (method: string, path: string, body?: unknown) => fetch(`http://localhost:${PORT}${path}`, { method, headers: { ...cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

try {
  step("1. A data inventory the schema is checked against", "every table and column is declared with its category, purpose and lawful basis; a column the inventory does not know fails the check, and the export refuses to run");
  const ok = await checkInventory(db);
  const personal = inventory.reduce((n, t) => n + Object.keys(t.columns).length, 0);
  const exportedCols = inventory.reduce((n, t) => n + exported(t).length, 0);
  console.log(`   ${inventory.length} tables with personal data, ${personal} columns classified (${exportedCols} exported, the rest technical keys or withheld with a reason); ${Object.keys(notPersonal).length} tables declared not personal: ${Object.keys(notPersonal).join(", ")}`);
  check("the live schema matches the inventory", ok.length === 0);

  await db.query(`ALTER TABLE members ADD COLUMN preferred_name text;
    CREATE TABLE chat_messages (id serial PRIMARY KEY, member_id int REFERENCES members, sent_at timestamptz, body text);
    ALTER TABLE purge_runs ADD COLUMN operator_email text;`);
  console.log("   a hotfix migration adds members.preferred_name, a chat_messages table and purge_runs.operator_email, without touching the inventory");
  const problems = await checkInventory(db);
  for (const p of problems) console.log(`   inventory: ${p}`);
  let blocked = false;
  try {
    await buildExport(db, 42, { id: 0, receivedAt: clock.now(), dueOn: "" }, clock.now());
  } catch (e) {
    blocked = e instanceof InventoryIncomplete;
  }
  console.log(`   export attempted with the gap: ${blocked ? "refused (InventoryIncomplete)" : "ran"}`);
  check("the check names the new column, the new table and the personal-looking column, and the export fails closed", problems.length === 3 && blocked);
  await db.query("ALTER TABLE members DROP COLUMN preferred_name; DROP TABLE chat_messages; ALTER TABLE purge_runs DROP COLUMN operator_email;");
  check("after the fix (here: the migration reverted) the check passes again", (await checkInventory(db)).length === 0);

  step("2. Verify identity: a recent password, not just a session", "the member signed in 3 hours ago; a copy of everything needs a password typed in the last 5 minutes (max_age / auth_time, as in 26-sso), and the member is the session's member, never a parameter");
  await db.query("INSERT INTO sessions VALUES ($1, 42, $2, $2, 'Mozilla/5.0 (X11; Linux x86_64) Firefox/141.0')", [tokenHash(token), new Date(clock.now().getTime() - 3 * 3600_000)]);
  const stale = await call("POST", "/me/data-export");
  console.log(`   POST /me/data-export with a 3-hour-old sign-in -> ${stale.status} ${await stale.text()}`);
  const wrong = await call("POST", "/reauth", { password: "password123" });
  console.log(`   POST /reauth with a wrong password -> ${wrong.status}`);
  const right = await call("POST", "/reauth", { password: DEMO_PASSWORD });
  console.log(`   POST /reauth with the right password -> ${right.status}`);
  check("a stale session is refused with reauthentication_required; only the right password refreshes auth_time", stale.status === 401 && wrong.status === 401 && right.status === 204);
  check("no request was logged before identity was verified", (await one("SELECT count(*)::int AS n FROM dsar_requests WHERE member_id = 42")).n === 1);

  step("3. Collect everything from the inventory and export it", "one query per inventoried table with the table's subject predicate; data.json plus one CSV per table, a README with art. 15(1) information per file, an HTML index, a manifest of SHA-256 checksums, zipped");
  clock.advance(40_000);
  const created = await call("POST", "/me/data-export");
  const c = await created.json();
  console.log(`   POST /me/data-export 40 s later -> ${created.status} ${JSON.stringify(c)}`);
  const dl = await call("GET", c.download);
  const zipBytes = Buffer.from(await dl.arrayBuffer());
  console.log(`   GET ${c.download} -> ${dl.status} ${dl.headers.get("content-type")}, ${zipBytes.length} bytes`);
  rmSync("out/export-M0042", { recursive: true, force: true });
  mkdirSync("out", { recursive: true });
  writeFileSync("out/export-M0042.zip", zipBytes);
  console.log(execFileSync("unzip", ["-t", "out/export-M0042.zip"]).toString().trim().split("\n").slice(-1).map((l) => `   unzip -t: ${l.trim()}`)[0]);
  execFileSync("unzip", ["-q", "-o", "out/export-M0042.zip", "-d", "out"]);
  const dir = "out/export-M0042";
  const files = ["README.md", "index.html", "data.json", "manifest.json", ...readdirSync(`${dir}/csv`).map((f) => `csv/${f}`)];
  const data = JSON.parse(readFileSync(`${dir}/data.json`, "utf8"));
  for (const [table, s] of Object.entries<{ rows: unknown[]; portable: boolean }>(data.data)) console.log(`   ${table.padEnd(16)} ${String(s.rows.length).padStart(4)} rows  ${s.portable ? "portable" : ""}`);
  for (const w of data.withheld) console.log(`   withheld ${w.column ? `${w.table}.${w.column}` : w.table}: ${w.reason.length > 90 ? `${w.reason.slice(0, 90)}...` : w.reason}`);
  const shown = inventory.filter((t) => !t.withheld).map((t) => t.table);
  check("data.json has a section for every inventoried table, and a CSV each", JSON.stringify(Object.keys(data.data).sort()) === JSON.stringify([...shown].sort()) && shown.every((t) => files.includes(`csv/${t}.csv`)));
  check("141 monthly contributions (2015-01 to 2026-09), 2 beneficiaries, 3 support tickets", data.data.contributions.rows.length === 141 && data.data.beneficiaries.rows.length === 2 && data.data.support_tickets.rows.length === 3);
  const all = files.map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n");
  const pw = (await one("SELECT password_hash FROM credentials WHERE member_id = 42")).password_hash as string;
  check("no secret leaves: neither the password hash nor the session hash appears in any file", !all.includes(pw.split("$")[2]) && !all.includes(tokenHash(token)) && !all.includes("scrypt$"));
  check("third parties' dates of birth are withheld (art. 15(4)), their names and shares are shown", !all.includes("1985-09-02") && all.includes("Sam Martin"));
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
  check("every file's SHA-256 matches the manifest", manifest.files.length === files.length - 1 && manifest.files.every((f: { file: string; sha256: string }) => createHash("sha256").update(readFileSync(`${dir}/${f.file}`)).digest("hex") === f.sha256));
  const readme = readFileSync(`${dir}/README.md`, "utf8");
  check("the README explains every file: purpose, lawful basis, source, recipients and retention for each table", shown.every((t) => readme.includes(`csv/${t}.csv`)) && (readme.match(/- How long we keep it:/g) ?? []).length === shown.length);
  const other = await call("GET", "/me/data-export/1");
  console.log(`   GET /me/data-export/1 (request #1 belongs to another member) -> ${other.status}`);
  check("another member's export is a 404", other.status === 404);

  step("4. Log the request and its one-month deadline", "received -> due one month later (same day number, last day of a shorter month, next working day after a weekend); extendable by two months if the member is told within the first");
  const req = await one("SELECT id, kind, received_at, due_on::text, verified_by, status, completed_at, left(export_sha256, 16) AS sha FROM dsar_requests WHERE id = $1", [c.request_id]);
  console.log(`   request #${req.id}: ${req.kind}, received ${req.received_at.toISOString()}, due ${req.due_on}, ${req.status} ${req.completed_at.toISOString()}, verified by ${req.verified_by}, export sha256 ${req.sha}...`);
  for (const e of (await db.query("SELECT at, event, detail FROM dsar_events WHERE request_id = $1 ORDER BY id", [c.request_id])).rows) console.log(`     ${e.at.toISOString()}  ${e.event.padEnd(18)} ${e.detail}`);
  for (const d of ["2026-10-03", "2026-01-31", "2026-03-31", "2026-05-15"]) console.log(`   received ${d}: one month -> ${addMonths(d, 1)}, due ${dueOn(d)}, extended ${extendedDueOn(d)}`);
  check("received 2026-10-03 is due 2026-11-03; 31 January ends on 28 February, a Saturday, so 2 March", req.due_on === "2026-11-03" && dueOn("2026-01-31") === "2026-03-02" && dueOn("2026-03-31") === "2026-04-30" && extendedDueOn("2026-10-03") === "2027-01-04");
  check("the request was answered on the day, well inside its deadline", req.status === "completed" && req.completed_at.toISOString().slice(0, 10) <= req.due_on);

  step("5. Retention: a policy per table, a batched purge that respects legal holds", "each policy says how long and from when; the job deletes or anonymises expired rows 1000 at a time, each batch its own transaction, skipping members under a legal hold; a second run finds nothing");
  const before = await eligibility(db, clock.now());
  console.log("   table             keep        from                             action     rows  expired  held");
  for (const b of before) console.log(`   ${b.table.padEnd(17)} ${b.keep.padEnd(11)} ${b.anchor.padEnd(32)} ${b.action.padEnd(10)} ${String(b.total).padStart(5)}  ${String(b.eligible).padStart(7)}  ${String(b.held).padStart(4)}`);
  const m42 = await one("SELECT count(*)::int AS n FROM contributions WHERE member_id = 42");
  const r = await purge(db, clock.now(), 1000);
  const after = await eligibility(db, clock.now());
  console.log("   after:");
  for (const a of after) console.log(`   ${a.table.padEnd(17)} rows ${String(before.find((b) => b.table === a.table)!.total).padStart(5)} -> ${String(a.total).padStart(5)}, expired ${a.eligible}, held ${a.held}`);
  check("every expired row was purged, and nothing else", r.every((x) => x.purged === before.find((b) => b.table === x.table)!.eligible) && after.every((a) => a.eligible === 0));
  check("contributions were deleted in several batches of at most 1000", (r.find((x) => x.table === "contributions")?.batches ?? 0) > 1);
  const hold = await one("SELECT h.member_id, m.member_no, m.left_on::text, (SELECT count(*)::int FROM contributions c WHERE c.member_id = h.member_id) AS contributions FROM legal_holds h JOIN members m ON m.id = h.member_id WHERE h.released_at IS NULL");
  console.log(`   under a legal hold: ${hold.member_no}, left ${hold.left_on}, still ${hold.contributions} contributions and a named record`);
  check("the member under a legal hold kept everything; the expired holds' own record was purged", hold.contributions > 0 && hold.member_no.startsWith("M") && (await one("SELECT count(*)::int AS n FROM legal_holds")).n === 1);
  const anon = await one("SELECT count(*)::int AS n, count(*) FILTER (WHERE given_name IS NULL AND email IS NULL AND national_id IS NULL AND extract(doy FROM birth_date) = 1)::int AS clean FROM members WHERE anonymised_at IS NOT NULL");
  console.log(`   anonymised members: ${anon.n}, each with no name, email or national id and only the year of birth`);
  check("anonymised members keep no direct identifier", anon.n > 0 && anon.n === anon.clean);
  check("M0042, an active member, lost nothing", (await one("SELECT count(*)::int AS n FROM contributions WHERE member_id = 42")).n === m42.n);
  const again = await purge(db, clock.now(), 1000, () => {});
  check("a second run purges nothing", again.every((x) => x.purged === 0));
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  server.closeAllConnections();
  server.close();
  await db.end();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
