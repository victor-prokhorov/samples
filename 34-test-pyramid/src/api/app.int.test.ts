// API integration level: the real HTTP handler against a real Postgres 16 (Docker, port 55464), its own database.
// What only this level can see: SQL, numeric columns coming back as strings, constraints, concurrency.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { createApp } from "./app.js";
import { pool, recreate } from "./db.js";

const DB = "pyramid_api_test";
let db: pg.Pool;
let server: Server;
let base: string;

beforeAll(async () => {
  await recreate(DB);
  db = pool(DB);
  server = createServer(createApp({ pool: db, today: () => "2026-10-03" }));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await db.end();
});

beforeEach(async () => {
  await db.query("TRUNCATE contribution_changes RESTART IDENTITY");
});

const post = (id: string, body: unknown) => fetch(`${base}/api/members/${id}/contribution-changes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("GET /api/members/:id", () => {
  it("returns the member with numbers as numbers", async () => {
    const res = await fetch(`${base}/api/members/M0002`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "M0002", name: "Bruno Petit", employer: "Globex", salary: 36500, rate: 4, pending: null, today: "2026-10-03" });
  });

  it("404s an unknown member", async () => {
    expect((await fetch(`${base}/api/members/M9999`)).status).toBe(404);
  });
});

describe("POST /api/members/:id/contribution-changes", () => {
  it("stores a valid change and shows it as pending", async () => {
    const res = await post("M0001", { rate: "6.5", effectiveFrom: "2026-12-01" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 1, rate: 6.5, effectiveFrom: "2026-12-01", status: "pending", monthly: { member: 227.5, employer: 175, total: 402.5 } });
    const { rows } = await db.query("SELECT member_id, rate::text, effective_from::text, status FROM contribution_changes");
    expect(rows).toEqual([{ member_id: "M0001", rate: "6.5", effective_from: "2026-12-01", status: "pending" }]);
    const member = await (await fetch(`${base}/api/members/M0001`)).json();
    expect(member.pending).toEqual({ id: 1, rate: 6.5, effectiveFrom: "2026-12-01" });
  });

  it("refuses an invalid change with every field error, and stores nothing", async () => {
    const res = await post("M0001", { rate: "16", effectiveFrom: "2026-10-01" });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ errors: { rate: "Enter a rate between 2% and 15%", effectiveFrom: "A change starts next month at the earliest" } });
    expect((await db.query("SELECT count(*)::int AS n FROM contribution_changes")).rows[0].n).toBe(0);
  });

  it("refuses a second pending change with a 409", async () => {
    expect((await post("M0003", { rate: 8, effectiveFrom: "2026-11-01" })).status).toBe(201);
    const res = await post("M0003", { rate: 9, effectiveFrom: "2026-12-01" });
    expect(res.status).toBe(409);
  });

  it("lets exactly one of two concurrent requests through (the partial unique index decides)", async () => {
    const results = await Promise.all([post("M0002", { rate: 5, effectiveFrom: "2026-11-01" }), post("M0002", { rate: 6, effectiveFrom: "2026-11-01" })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await db.query("SELECT count(*)::int AS n FROM contribution_changes WHERE member_id = 'M0002'")).rows[0].n).toBe(1);
  });

  it("refuses a body that is not JSON", async () => {
    const res = await fetch(`${base}/api/members/M0001/contribution-changes`, { method: "POST", body: "rate=6" });
    expect(res.status).toBe(400);
  });

  it("keeps the CHECK constraint as a last line of defence", async () => {
    await expect(db.query("INSERT INTO contribution_changes (member_id, rate, effective_from) VALUES ('M0001', 40, '2026-11-01')")).rejects.toThrow(/contribution_changes_rate_check/);
  });
});
