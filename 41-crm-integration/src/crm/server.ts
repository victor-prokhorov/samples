// The partner: a fake CRM with an OData v4-style Web API, written to behave like the real ones.
//   GET   /api/data/v9.2/Contacts?$filter=&$select=&$orderby=&$top=&$count=true   (Prefer: odata.maxpagesize=N, at most 50)
//   GET   /api/data/v9.2/Contacts(<guid>)?$select=
//   PATCH /api/data/v9.2/Contacts(<guid>)    If-Match: W/"<VersionNumber>"  -> 204, 412, 428
//   the same for Accounts.
// Faults: every 10th data request from the 4th is a 429 with Retry-After: 1, every 10th from the 8th a 503.
// Every write sends a webhook to WEBHOOK_URL, signed with HMAC-SHA256 over "<timestamp>.<body>".
// /_admin/* is the CRM's own users and operators: edit or delete a record, freeze the clock, redeliver a webhook.
import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { ODataError, type Row, decodeToken, encodeToken, isAfter, matches, parseFilter, parseOrderBy, sortRows } from "./odata.js";
import { seed } from "./seed.js";

export const CRM_PORT = 53151;
const BASE = "/api/data/v9.2";
const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "http://localhost:53051/webhooks/crm";
const SECRET = process.env.WEBHOOK_SECRET ?? "whsec_demo_only_not_a_real_secret";
const MAX_PAGE = 50; // the server pages at 50 rows whatever the client asks: server-driven paging

const data = seed();
let version = data.version;
type EntitySet = { key: string; logical: string; rows: Map<string, Row>; fields: Set<string> };
const sets: Record<string, EntitySet> = {
  Contacts: { key: "ContactId", logical: "contact", rows: new Map(data.contacts.map((r) => [r.ContactId as string, r])), fields: new Set(Object.keys(data.contacts[0])) },
  Accounts: { key: "AccountId", logical: "account", rows: new Map(data.accounts.map((r) => [r.AccountId as string, r])), fields: new Set(Object.keys(data.accounts[0])) },
};
const READ_ONLY = new Set(["ContactId", "AccountId", "FullName", "CreatedOn", "ModifiedOn", "VersionNumber"]);

// ModifiedOn has second precision, like most CRMs. The clock can be frozen to put several writes in one second.
let frozen: string | null = null;
const nowIso = () => frozen ?? new Date(Math.floor(Date.now() / 1000) * 1000).toISOString().replace(".000Z", "Z");
const etagOf = (r: Row) => `W/"${r.VersionNumber}"`;

let dataRequests = 0;
let faultsOn = true;
const served = { "429": 0, "503": 0 };

type Delivery = { eventId: string; timestamp: string; signature: string; body: string; status: number; answer: string };
const deliveries: Delivery[] = [];

const sign = (timestamp: string, body: string) => "v1=" + createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");

async function deliver(eventId: string, body: string): Promise<Delivery> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(timestamp, body);
  let status = 0;
  let answer = "";
  try {
    const r = await fetch(WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json", "x-crm-event-id": eventId, "x-crm-timestamp": timestamp, "x-crm-signature": signature }, body });
    status = r.status;
    answer = await r.text();
  } catch (e) {
    answer = String(e);
  }
  const d = { eventId, timestamp, signature, body, status, answer };
  deliveries.push(d);
  return d;
}

async function notify(set: EntitySet, id: string, message: "Create" | "Update" | "Delete") {
  const eventId = randomUUID();
  const body = JSON.stringify({ EventId: eventId, MessageName: message, PrimaryEntityName: set.logical, PrimaryEntityId: id, OperationCreatedOn: new Date().toISOString() });
  return deliver(eventId, body);
}

function project(r: Row, select: string[] | null): Row {
  const out: Row = { "@odata.etag": etagOf(r) };
  for (const f of select ?? Object.keys(r)) out[f] = r[f] ?? null;
  return out;
}

function parseSelect(set: EntitySet, s: string | null): string[] | null {
  if (!s) return null;
  const cols = s.split(",").map((c) => c.trim());
  for (const c of cols) if (!set.fields.has(c)) throw new ODataError(400, "0x80060888", `Could not find a property named '${c}' on type 'Microsoft.Dynamics.CRM.${set.logical}'.`);
  return cols;
}

function send(res: http.ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json; odata.metadata=minimal", "odata-version": "4.0", ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString();
}

function list(set: EntitySet, name: string, url: URL, req: http.IncomingMessage, res: http.ServerResponse) {
  const q = url.searchParams;
  const select = parseSelect(set, q.get("$select"));
  const filter = q.get("$filter") ? parseFilter(q.get("$filter")!, set.fields) : null;
  const order = parseOrderBy(q.get("$orderby"), set.fields, set.key);
  const top = q.get("$top") ? Number(q.get("$top")) : Infinity;
  const pref = /odata\.maxpagesize=(\d+)/.exec(String(req.headers.prefer ?? ""));
  const pageSize = Math.min(pref ? Number(pref[1]) : MAX_PAGE, MAX_PAGE);
  const all = sortRows([...set.rows.values()].filter((r) => !filter || matches(filter, r)), order);
  const cursor = q.get("$skiptoken") ? decodeToken(q.get("$skiptoken")!) : { after: [], served: 0 };
  const rest = cursor.after.length ? all.filter((r) => isAfter(r, order, cursor.after)) : all;
  const take = Math.min(pageSize, top - cursor.served);
  const page = rest.slice(0, take);
  const body: Row = { "@odata.context": `${url.origin}${BASE}/$metadata#${name}(${select?.join(",") ?? "*"})` };
  if (q.get("$count") === "true") body["@odata.count"] = all.length;
  body.value = page.map((r) => project(r, select));
  if (rest.length > take && cursor.served + take < top) {
    const last = page[page.length - 1];
    const next = new URL(url);
    next.searchParams.set("$skiptoken", encodeToken({ after: order.map((o) => last[o.field]), served: cursor.served + take }));
    body["@odata.nextLink"] = next.toString();
  }
  send(res, 200, body, pref ? { "preference-applied": `odata.maxpagesize=${pageSize}` } : {});
}

async function data_(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const n = ++dataRequests;
  if (faultsOn && n % 10 === 4) {
    served["429"]++;
    return send(res, 429, { error: { code: "0x80072322", message: "Number of requests exceeded the limit of 6000 over time window of 300 seconds." } }, { "retry-after": "1" });
  }
  if (faultsOn && n % 10 === 8) {
    served["503"]++;
    return send(res, 503, { error: { code: "0x80040216", message: "The service is temporarily unavailable." } });
  }
  const m = /^\/api\/data\/v9\.2\/(\w+)(?:\(([0-9a-f-]{36})\))?$/i.exec(url.pathname);
  const set = m && sets[m[1]];
  if (!m || !set) throw new ODataError(404, "0x80060888", `Resource not found for the segment '${url.pathname.slice(BASE.length + 1)}'.`);
  const id = m[2]?.toLowerCase();
  if (!id) {
    if (req.method !== "GET") throw new ODataError(405, "0x80060888", "Method not allowed");
    return list(set, m[1], url, req, res);
  }
  const row = set.rows.get(id);
  if (!row) throw new ODataError(404, "0x80040217", `${set.logical} With Id = ${id} Does Not Exist`);
  if (req.method === "GET") {
    const select = parseSelect(set, url.searchParams.get("$select"));
    return send(res, 200, { "@odata.context": `${url.origin}${BASE}/$metadata#${m[1]}/$entity`, ...project(row, select) }, { etag: etagOf(row) });
  }
  if (req.method === "PATCH") {
    const ifMatch = req.headers["if-match"];
    if (!ifMatch) throw new ODataError(428, "0x80060891", "This operation requires an If-Match header.");
    if (ifMatch !== "*" && ifMatch !== etagOf(row)) throw new ODataError(412, "0x80060882", `The version of the existing record doesn't match the RowVersion property provided. Current: ${etagOf(row)}, If-Match: ${ifMatch}`);
    const patch = JSON.parse((await readBody(req)) || "{}") as Row;
    for (const f of Object.keys(patch)) if (!set.fields.has(f) || READ_ONLY.has(f)) throw new ODataError(400, "0x80060888", `Property '${f}' cannot be updated.`);
    write(set, row, patch);
    send(res, 204, undefined, { etag: etagOf(row), "odata-entityid": `${url.origin}${BASE}/${m[1]}(${id})` });
    await notify(set, id, "Update");
    return;
  }
  throw new ODataError(405, "0x80060888", "Method not allowed");
}

function write(set: EntitySet, row: Row, patch: Row, modifiedOn = nowIso()) {
  Object.assign(row, patch, { ModifiedOn: modifiedOn, VersionNumber: ++version });
  if (set.logical === "contact") row.FullName = `${row.FirstName} ${row.LastName}`;
}

// ---------- the CRM's own users and operators ----------
async function admin(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const body = req.method === "POST" ? JSON.parse((await readBody(req)) || "{}") : {};
  const contacts = sets.Contacts;
  const byNo = (no: string) => {
    const r = [...contacts.rows.values()].find((c) => c.New_MemberNo === no);
    if (!r) throw new ODataError(404, "admin", `no contact ${no}`);
    return r;
  };
  switch (url.pathname) {
    case "/_admin/contacts/update": {
      // a CRM user edits a contact; notify:false = the webhook is lost; modifiedOn = a restore or import that keeps old timestamps
      const row = byNo(body.memberNo);
      write(contacts, row, body.set ?? {}, body.modifiedOn ?? nowIso());
      const delivery = body.notify === false ? null : await notify(contacts, row.ContactId as string, "Update");
      return send(res, 200, { contactId: row.ContactId, modifiedOn: row.ModifiedOn, etag: etagOf(row), delivery });
    }
    case "/_admin/contacts/delete": {
      // a hard delete: the row is gone, so no ModifiedOn query will ever return it
      const row = byNo(body.memberNo);
      contacts.rows.delete(row.ContactId as string);
      const delivery = body.notify === false ? null : await notify(contacts, row.ContactId as string, "Delete");
      return send(res, 200, { contactId: row.ContactId, delivery });
    }
    case "/_admin/clock":
      frozen = body.freeze ? nowIso() : null;
      return send(res, 200, { frozen });
    case "/_admin/faults":
      faultsOn = Boolean(body.enabled);
      return send(res, 200, { faultsOn });
    case "/_admin/redeliver": {
      // the CRM retries a delivery it thinks failed: same event, same body, fresh timestamp and signature
      const d = deliveries.find((x) => x.eventId === body.eventId);
      if (!d) throw new ODataError(404, "admin", "no such delivery");
      return send(res, 200, await deliver(d.eventId, d.body));
    }
    case "/_admin/deliveries":
      return send(res, 200, deliveries);
    case "/_admin/stats":
      return send(res, 200, { dataRequests, faults: served, contacts: contacts.rows.size });
  }
  throw new ODataError(404, "admin", "unknown admin route");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${CRM_PORT}`);
  try {
    if (url.pathname.startsWith("/_admin/")) await admin(req, res, url);
    else if (url.pathname.startsWith(BASE + "/")) await data_(req, res, url);
    else if (url.pathname === "/health") send(res, 200, { ok: true });
    else throw new ODataError(404, "0x80060888", "Not found");
  } catch (e) {
    if (e instanceof ODataError) send(res, e.status, { error: { code: e.code, message: e.message } });
    else {
      console.error(e);
      send(res, 500, { error: { code: "0x80040265", message: String(e) } });
    }
  }
});
server.listen(CRM_PORT, () => console.log(`   [crm] OData API on http://localhost:${CRM_PORT}${BASE}, ${sets.Contacts.rows.size} contacts, ${sets.Accounts.rows.size} accounts, webhooks to ${WEBHOOK_URL}`));
process.on("SIGTERM", () => (server.closeAllConnections(), server.close(() => process.exit(0))));
