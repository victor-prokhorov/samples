import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { CrmHttpError, type RetryEvent } from "./acl/client.js";
import type { CrmContact } from "./acl/crm-types.js";
import { driftCount, reconcile, repair, writeHtml } from "./app/reconcile.js";
import { startApp } from "./app/server.js";
import { syncEmployers, syncMembers } from "./app/sync.js";
import { APP_PORT, CRM_PORT, db } from "./db.js";
import { compose } from "./main.js";
import { naiveImport } from "./naive.js";

let failed = 0;
function check(label: string, cond: boolean) {
  console.log(`   ${cond ? "check ok" : "CHECK FAILED"}: ${label}`);
  if (!cond) (failed++, (process.exitCode = 1));
}
function step(title: string, concept: string) {
  console.log(`\n## ${title}\n   concept: ${concept}`);
}

const ADMIN = `http://localhost:${CRM_PORT}/_admin`;
const admin = async (path: string, body?: unknown) => (await fetch(`${ADMIN}/${path}`, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
const app = (path: string, init?: RequestInit) => fetch(`http://localhost:${APP_PORT}${path}`, init);
const one = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0];

// the app's clock, which the demo can move forward to replay an old delivery
let offsetMs = 0;
const retries: RetryEvent[] = [];
const c = compose(
  () => Date.now() + offsetMs,
  (e) => {
    retries.push(e);
    const u = new URL(e.url);
    console.log(`   [retry] ${e.status} on ${e.method} ${u.pathname.split("/").pop()}${u.searchParams.has("$skiptoken") ? " (next page)" : ""}, Retry-After: ${e.retryAfter ?? "none"} -> wait ${e.waitMs} ms, attempt ${e.attempt + 1}`);
  },
);

const crm = spawn(process.execPath, ["--import", "tsx", "src/crm/server.ts"], { stdio: "inherit" });
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`http://localhost:${CRM_PORT}/health`)).ok) break;
  } catch {
    if (i > 100) throw new Error("CRM did not start");
    await sleep(100);
  }
}
const server = await startApp(APP_PORT, c);

try {
  step("1. The leaky version", "CRM shapes straight into the app: one GET, no paging, no retry, option-set codes and GUIDs in the app's code, no validation");
  const naive = await naiveImport(db);
  const nv = await one(`SELECT count(*)::int AS n, count(*) FILTER (WHERE email NOT LIKE '%@%')::int AS bad_email, count(*) FILTER (WHERE member_no IS NULL)::int AS no_number, count(*) FILTER (WHERE birth_date > '2026-10-03')::int AS future FROM naive_members`);
  console.log(`   naive import: ${naive.rows} rows stored, @odata.nextLink present and ignored: ${naive.nextLinkIgnored}, ${naive.fields} CRM fields per row (no $select: phone and notes too)`);
  console.log(`   stored as is: ${nv.bad_email} email without @, ${nv.no_number} member without a number`);
  check("the naive import took the first page only (50 of 120 contacts) and stored invalid rows", naive.rows === 50 && naive.nextLinkIgnored && nv.bad_email + nv.no_number >= 2);

  step("2. Full sync through the anti-corruption layer", "the client pages with @odata.nextLink and retries 429/503, honouring Retry-After; the translator maps CRM fields and option-set codes to domain types; the domain's invariants reject what is wrong; rejects go to quarantine");
  const emp = await syncEmployers(c.dir, c.store);
  console.log(`   employers: ${emp.applied} applied`);
  const full = await syncMembers(c.dir, c.store);
  console.log(`   members: fetched ${full.fetched} in ${c.client.stats.pages - 1} pages, applied ${full.applied}, rejected ${full.rejected}; mark ${full.markBefore} -> ${full.markAfter}`);
  for (const q of (await db.query("SELECT source_id, reasons, raw->>'New_MemberNo' AS no FROM quarantine ORDER BY source_id")).rows) console.log(`   quarantined ${q.no ?? "(no number)"} ${q.source_id}: ${q.reasons.join("; ")}`);
  const raws = (await db.query("SELECT raw FROM quarantine")).rows.map((r) => r.raw as Record<string, unknown>);
  const r429 = retries.find((r) => r.status === 429);
  check("a 429 was retried after waiting at least its Retry-After (1 s)", !!r429 && r429.retryAfter === "1" && r429.waitMs >= 1000);
  check("120 contacts fetched over 3 pages: 116 members applied, 4 quarantined", full.fetched === 120 && full.applied === 116 && full.rejected === 4);
  check("the unknown option-set code 100000003 is quarantined, not mapped to a guess", raws.some((r) => r.New_SchemeStatus === 100000003));
  check("$select kept unread CRM fields out: no notes or phone in what crossed the boundary", raws.every((r) => !("New_InternalNotes" in r) && !("Telephone1" in r)));
  check("members in Postgres: 116, and every one passes the domain's constraints", (await one("SELECT count(*)::int AS n FROM members")).n === 116);

  step("3. Incremental sync with a high-water mark", "ask only for ModifiedOn ge <mark>, in ModifiedOn order, move the mark after the run; ge, not gt, because the mark has second precision");
  for (const [no, set] of [["M0003", { LastName: "Garnier" }], ["M0004", { New_SchemeStatus: 100000002 }], ["M0005", { EMailAddress1: "sam.new@example.org" }]] as const) await admin("contacts/update", { memberNo: no, set, notify: false });
  console.log("   CRM users edited M0003, M0004, M0005 (webhooks off for this step: the scheduled sync alone)");
  const inc = await syncMembers(c.dir, c.store);
  console.log(`   GET Contacts?$filter=ModifiedOn ge ${inc.markBefore}&$orderby=ModifiedOn asc,ContactId asc`);
  console.log(`   fetched ${inc.fetched}, applied ${inc.applied}, unchanged ${inc.unchanged} (the row at the mark itself comes back; its version makes it a no-op); mark -> ${inc.markAfter}`);
  check("the incremental sync applied exactly the 3 edits", inc.applied === 3 && inc.fetched < 10);
  const m4 = await one("SELECT status FROM members WHERE member_no = 'M0004'");
  check("M0004's option-set code 100000002 arrived as the domain status 'retired'", m4.status === "retired");

  await admin("clock", { freeze: true });
  await admin("contacts/update", { memberNo: "M0006", set: { LastName: "Fontaine" }, notify: false });
  const s1 = await syncMembers(c.dir, c.store);
  await admin("contacts/update", { memberNo: "M0007", set: { LastName: "Perrin" }, notify: false });
  await admin("clock", { freeze: false });
  const mark = s1.markAfter!;
  const count = async (op: string) => {
    let n = 0;
    for await (const p of c.client.pages<CrmContact>("Contacts", { $select: "ContactId", $filter: `ModifiedOn ${op} ${mark}` })) n += p.value.length;
    return n;
  };
  const gt = await count("gt");
  const ge = await count("ge");
  console.log(`   M0006 and M0007 were edited in the same second ${mark}, with a sync in between`);
  console.log(`   ModifiedOn gt ${mark}: ${gt} rows (M0007 would be lost for good); ModifiedOn ge ${mark}: ${ge} rows`);
  const s2 = await syncMembers(c.dir, c.store);
  console.log(`   next sync (ge): fetched ${s2.fetched}, applied ${s2.applied}, unchanged ${s2.unchanged}`);
  check("gt would miss the second write of the same second; ge picks it up and the repeat is a no-op", gt === 0 && ge >= 2 && s2.applied === 1 && (await one("SELECT family_name FROM members WHERE member_no = 'M0007'")).family_name === "Perrin");

  step("4. Webhooks: signed, fresh, once", "HMAC-SHA256 over '<timestamp>.<body>', constant-time compare, a 300 s window, the event id from the signed body as idempotency key; the event is a hint: the app re-reads the record");
  const upd = await admin("contacts/update", { memberNo: "M0010", set: { LastName: "Marchand" } });
  const d = upd.delivery;
  console.log(`   CRM delivered event ${d.eventId.slice(0, 8)}: x-crm-timestamp ${d.timestamp}, x-crm-signature ${d.signature.slice(0, 20)}...`);
  console.log(`   app answered ${d.status} ${d.answer}`);
  check("a genuine delivery is verified and applied", d.status === 200 && JSON.parse(d.answer).outcome === "applied" && (await one("SELECT family_name FROM members WHERE member_no = 'M0010'")).family_name === "Marchand");

  const dup = await admin("redeliver", { eventId: d.eventId });
  const inbox = await one("SELECT deliveries, outcome FROM webhook_inbox WHERE event_id = $1", [d.eventId]);
  console.log(`   duplicate delivery (the CRM retried, new timestamp, same event): ${dup.status} ${dup.answer}; inbox: deliveries=${inbox.deliveries}, outcome=${inbox.outcome}`);
  check("a duplicate delivery is acknowledged and not processed again", dup.status === 200 && JSON.parse(dup.answer).status === "duplicate" && inbox.deliveries === 2);

  const send = (body: string, ts: string, sig: string) => app("/webhooks/crm", { method: "POST", headers: { "content-type": "application/json", "x-crm-timestamp": ts, "x-crm-signature": sig }, body });
  const tampered = d.body.replace(/"PrimaryEntityId":"[^"]+"/, `"PrimaryEntityId":"c0000000-0000-4000-8000-00000000000b"`);
  const forged1 = await send(tampered, d.timestamp, d.signature);
  const guessed = "v1=" + createHmac("sha256", "guessed-secret").update(`${d.timestamp}.${tampered}`).digest("hex");
  const forged2 = await send(tampered, d.timestamp, guessed);
  console.log(`   forged: body changed, original signature -> ${forged1.status} ${await forged1.text()}`);
  console.log(`   forged: signed with a guessed secret -> ${forged2.status} ${await forged2.text()}`);
  check("forged deliveries are refused with 401", forged1.status === 401 && forged2.status === 401);

  offsetMs = 6 * 60_000;
  const replay = await send(d.body, d.timestamp, d.signature);
  console.log(`   replay of the captured delivery 6 minutes later (exact bytes, valid signature) -> ${replay.status} ${await replay.text()}`);
  offsetMs = 0;
  const early = await send(d.body, d.timestamp, d.signature);
  console.log(`   the same replay inside the window -> ${early.status} ${await early.text()}`);
  check("an old delivery is refused by the window; inside the window the event id catches it", replay.status === 401 && early.status === 200 && (await one("SELECT deliveries FROM webhook_inbox WHERE event_id = $1", [d.eventId])).deliveries === 3);
  const refusals = await one("SELECT count(*)::int AS n FROM webhook_refusals");
  check("3 refusals logged, and the forged event changed nothing", refusals.n === 3 && (await one("SELECT count(*)::int AS n FROM webhook_inbox")).n === 1);

  step("5. Writing back with ETags", "PATCH with If-Match on the version last seen; 412 means someone changed the record since: re-read, re-apply if they did not touch our field, otherwise report a conflict");
  const noIfMatch = await c.client.send("PATCH", c.client.url("Contacts(c0000000-0000-4000-8000-000000000014)"), { body: {} }).then((r) => ({ status: r.status }), (e: CrmHttpError) => e);
  console.log(`   PATCH without If-Match -> ${noIfMatch.status}`);
  await admin("contacts/update", { memberNo: "M0020", set: { Telephone1: "+33 6 11 22 33 44" }, notify: false });
  const ch1 = await app("/members/M0020/email", { method: "POST", body: JSON.stringify({ email: "Robin.New@Example.org" }) });
  const ch1b = await ch1.json();
  const crm20 = await c.client.get<CrmContact>("Contacts", "c0000000-0000-4000-8000-000000000014", ["EMailAddress1"]);
  console.log(`   M0020: a CRM user changed the phone; the member changes the email -> ${ch1.status} ${JSON.stringify(ch1b)}; CRM now has ${crm20?.EMailAddress1}`);
  check("a stale If-Match got 412, the adapter re-read and applied on the new ETag", noIfMatch.status === 428 && ch1.status === 200 && ch1b.conflicts === 1 && ch1b.attempts === 2 && crm20?.EMailAddress1 === "robin.new@example.org");
  await admin("contacts/update", { memberNo: "M0021", set: { EMailAddress1: "set.by.crm@example.org" }, notify: false });
  const ch2 = await app("/members/M0021/email", { method: "POST", body: JSON.stringify({ email: "set.by.member@example.org" }) });
  const ch2b = await ch2.json();
  const crm21 = await c.client.get<CrmContact>("Contacts", "c0000000-0000-4000-8000-000000000015", ["EMailAddress1"]);
  console.log(`   M0021: a CRM user changed the email too -> ${ch2.status} ${JSON.stringify(ch2b)}; CRM keeps ${crm21?.EMailAddress1}`);
  check("a real conflict is reported (409), not overwritten", ch2.status === 409 && crm21?.EMailAddress1 === "set.by.crm@example.org");

  step("6. Nightly reconciliation", "sync sees only what ModifiedOn shows; once a night, compare counts and checksums of the canonical records on both sides, by employer and then by member, and report the drift");
  await admin("contacts/delete", { memberNo: "M0030", notify: false });
  await admin("contacts/update", { memberNo: "M0040", set: { FirstName: "Dominique-Anne" }, modifiedOn: "2026-09-02T10:00:00Z", notify: false });
  await db.query("UPDATE members SET email = 'fixed.by.hand@example.org' WHERE member_no = 'M0050'");
  console.log("   drift made: M0030 hard-deleted in the CRM (no webhook), M0040 renamed by a CRM import that kept an old ModifiedOn, M0050's email edited by hand in the local database");
  const nightly = await syncMembers(c.dir, c.store);
  console.log(`   the nightly sync first: fetched ${nightly.fetched}, applied ${nightly.applied} (M0021's CRM-side email), none of the three`);
  const before = await reconcile(c.dir, c.store);
  writeHtml("out/reconciliation.html", before);
  console.log(`   counts: CRM ${before.counts.sourceActive} active = ${before.counts.sourceValid} valid + ${before.counts.quarantined} quarantined; local ${before.counts.local}`);
  console.log(`   checksums: CRM ${before.checksums.source.slice(0, 12)} local ${before.checksums.local.slice(0, 12)}`);
  for (const b of before.buckets) console.log(`   ${b.employer.padEnd(8)} CRM ${b.source} local ${b.local}  ${b.sourceChecksum === b.localChecksum ? "match" : "DIFFER"}`);
  for (const x of before.drift.extraLocally) console.log(`   extra locally:   ${x.memberNo}`);
  for (const x of before.drift.missingLocally) console.log(`   missing locally: ${x.memberNo}`);
  for (const x of before.drift.differing) console.log(`   differs:         ${x.memberNo} ${x.fields.map((f) => `${f.field} CRM='${f.source}' local='${f.local}'`).join(", ")}`);
  check("reconciliation found exactly the 3 drifts that sync cannot see", driftCount(before) === 3 && before.drift.extraLocally[0]?.memberNo === "M0030" && before.drift.differing.map((x) => x.memberNo).join() === "M0040,M0050");
  check("the counts reconcile: CRM active = local + quarantined + 0 missing - 1 extra", before.counts.sourceActive === before.counts.local - 1 + before.counts.quarantined);
  const fixed = await repair(c.dir, c.store, before);
  const after = await reconcile(c.dir, c.store);
  writeFileSync("out/reconciliation.json", JSON.stringify({ before, repaired: fixed, after }, null, 2) + "\n");
  console.log(`   repaired ${fixed} (the CRM wins); rerun: drift ${driftCount(after)}, checksums ${after.checksums.source === after.checksums.local ? "equal" : "different"}`);
  check("after repair the checksums are equal and the drift is zero", fixed === 3 && driftCount(after) === 0 && after.checksums.source === after.checksums.local);

  step("7. The domain never sees CRM shapes", "a dependency rule, checked: src/domain and src/app import nothing from src/acl or src/crm, and no CRM field name appears in them");
  const VOCAB = /\b(EMailAddress1|New_\w+|_ParentCustomerId_Value|StateCode|ContactId|AccountId|VersionNumber|ModifiedOn|odata)\b/;
  const offenders: string[] = [];
  for (const dir of ["src/domain", "src/app"])
    for (const f of readdirSync(dir)) {
      const src = readFileSync(`${dir}/${f}`, "utf8");
      if (/from "\.\.\/(acl|crm)\//.test(src)) offenders.push(`${dir}/${f} imports the ACL`);
      const hit = VOCAB.exec(src);
      if (hit) offenders.push(`${dir}/${f} mentions ${hit[1]}`);
    }
  console.log(`   scanned src/domain and src/app: ${offenders.length ? offenders.join("; ") : "no ACL import, no CRM vocabulary"}`);
  const naiveSrc = readFileSync("src/naive.ts", "utf8");
  console.log(`   for contrast, src/naive.ts mentions: ${[...new Set(naiveSrc.match(new RegExp(VOCAB.source, "g")))].join(", ")}`);
  check("the dependency rule holds", offenders.length === 0);

  const stats = await admin("stats");
  console.log(`\n   client: ${c.client.stats.requests} requests, ${c.client.stats.retries} retries, ${c.client.stats.waitedMs} ms waited; CRM served ${stats.faults["429"]} x 429 and ${stats.faults["503"]} x 503 over ${stats.dataRequests} data requests (one of them the naive import's)`);
  check("every 429 and 503 the CRM served was retried, none reached the domain", c.client.stats.retries === stats.faults["429"] + stats.faults["503"]);
} catch (e) {
  if (e instanceof CrmHttpError) console.error(e.status, e.body);
  console.error(e);
  process.exitCode = 1;
} finally {
  server.closeAllConnections();
  server.close();
  crm.kill("SIGTERM");
  await db.end();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
