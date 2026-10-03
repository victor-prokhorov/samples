// One matrix cell, asked three ways: of the code (can(), in matrix.ts), of the database (RLS, as the
// `app` role with the user's settings) and of an HTTP server (the request a client would send).
import type pg from "pg";
import { isRlsRefusal, setUser } from "./db.js";
import type { Cell } from "./matrix.js";

// A change request for the cell, inserted by the owner (bypassing RLS): who asked and for which member.
async function changeRequestFixture(c: Pick<pg.Pool, "query">, cell: Cell) {
  const { rows } = await c.query("INSERT INTO change_requests (member_id, requested_by, field, value) VALUES ($1, $2, 'address', '2 new street') RETURNING id", [
    cell.resource!.memberId,
    cell.resource!.requestedBy,
  ]);
  return rows[0].id as number;
}

// What the database lets the user do: run the action's statement under RLS inside a transaction that is
// rolled back, so every cell starts from the same data.
export async function dbAllows(owner: pg.Pool, cell: Cell): Promise<boolean> {
  const { subject, resource, row } = cell;
  if (!resource) throw new Error("n/a cell");
  const c = await owner.connect();
  try {
    await c.query("BEGIN");
    const crId = row.action === "change_request:read" || row.action === "change_request:approve" ? await changeRequestFixture(c, cell) : null;
    await c.query("SET LOCAL ROLE app");
    await setUser(c, subject);
    await c.query("SAVEPOINT op");
    try {
      const m = resource.memberId;
      const count = async (sql: string, p: unknown[]) => Number((await c.query(sql, p)).rows[0].n);
      switch (row.action) {
        case "member:read":
          return (await count("SELECT count(*) AS n FROM members WHERE id = $1", [m])) === 1;
        case "member:update":
          return (await c.query("UPDATE members SET address = address || ' (checked)' WHERE id = $1", [m])).rowCount === 1;
        case "contribution:read":
          return (await count("SELECT count(*) AS n FROM contributions WHERE member_id = $1", [m])) > 0;
        case "contribution:create":
          await c.query("INSERT INTO contributions (member_id, period, amount) VALUES ($1, '2026-10-01', 220)", [m]);
          return true;
        case "change_request:create":
          await c.query("INSERT INTO change_requests (member_id, requested_by, field, value) VALUES ($1, $2, 'address', '2 new street')", [m, subject.id]);
          return true;
        case "change_request:read":
          return (await count("SELECT count(*) AS n FROM change_requests WHERE id = $1", [crId])) === 1;
        case "change_request:approve":
          return (await c.query("UPDATE change_requests SET status = 'approved', approved_by = $2 WHERE id = $1", [crId, subject.id])).rowCount === 1;
        case "audit_log:read":
          return (await count("SELECT count(*) AS n FROM audit_log WHERE member_id = $1", [m])) > 0;
      }
    } catch (e) {
      if (isRlsRefusal(e)) return false; // WITH CHECK refused the new row
      throw e;
    }
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
}

// The HTTP request for a cell. Change requests to read or approve are created (and committed) first.
export async function httpCall(owner: pg.Pool, cell: Cell, base: string) {
  const { subject, resource, row } = cell;
  const m = resource!.memberId;
  const crId = row.action === "change_request:read" || row.action === "change_request:approve" ? await changeRequestFixture(owner, cell) : null;
  const [method, path, body]: [string, string, unknown?] = {
    "member:read": ["GET", `/members/${m}`],
    "member:update": ["PATCH", `/members/${m}`, { address: "3 moved street" }],
    "contribution:read": ["GET", `/members/${m}/contributions`],
    "contribution:create": ["POST", `/members/${m}/contributions`, { period: "2026-10-01", amount: 220 }],
    "change_request:create": ["POST", `/members/${m}/change-requests`, { field: "address", value: "2 new street" }],
    "change_request:read": ["GET", `/change-requests/${crId}`],
    "change_request:approve": ["POST", `/change-requests/${crId}/approve`],
    "audit_log:read": ["GET", `/members/${m}/audit-log`],
  }[row.action] as [string, string, unknown?];
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "x-user": subject.id, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { method, path, status: res.status, allowed: res.status < 300, body: await res.text() };
}
