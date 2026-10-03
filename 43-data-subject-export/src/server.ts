// The member's side: re-authenticate, ask for the export, download it. The member is always the session's member:
// no route takes a member id, so nobody can ask for someone else's data.
import http from "node:http";
import { MAX_AUTH_AGE_SECONDS, tokenHash, verifyPassword } from "./auth.js";
import { dueOn, extendedDueOn } from "./deadline.js";
import { InventoryIncomplete, buildExport } from "./export.js";
import type pg from "pg";

type Clock = { now: () => Date };
const archives = new Map<number, Buffer>(); // in production: object storage, a short expiry, a one-time link

export function startServer(port: number, db: pg.Pool, clock: Clock): Promise<http.Server> {
  const event = (requestId: number, name: string, detail: string) => db.query("INSERT INTO dsar_events (request_id, at, event, detail) VALUES ($1, $2, $3, $4)", [requestId, clock.now(), name, detail]);

  const server = http.createServer(async (req, res) => {
    const reply = (status: number, body: unknown) => (res.writeHead(status, { "content-type": "application/json" }), res.end(JSON.stringify(body)));
    try {
      const sid = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
      const s = sid ? (await db.query("SELECT member_id, auth_time FROM sessions WHERE id_hash = $1", [tokenHash(sid)])).rows[0] : undefined;
      if (!s) return reply(401, { error: "sign in first" });
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "POST" && url.pathname === "/reauth") {
        const cred = (await db.query("SELECT password_hash FROM credentials WHERE member_id = $1", [s.member_id])).rows[0];
        const ok = cred && verifyPassword(String(body.password ?? ""), cred.password_hash);
        await db.query("INSERT INTO login_events (member_id, at, ip, user_agent, outcome) VALUES ($1, $2, $3, $4, $5)", [s.member_id, clock.now(), "203.0.113.42", req.headers["user-agent"] ?? null, ok ? "reauth success" : "reauth failure"]);
        if (!ok) return reply(401, { error: "wrong password" });
        await db.query("UPDATE sessions SET auth_time = $2 WHERE id_hash = $1", [tokenHash(sid!), clock.now()]);
        return res.writeHead(204).end();
      }

      if (req.method === "POST" && url.pathname === "/me/data-export") {
        // identity: a valid session is not enough for a copy of everything; the password must have been typed recently
        const age = Math.round((clock.now().getTime() - new Date(s.auth_time).getTime()) / 1000);
        if (age > MAX_AUTH_AGE_SECONDS) return reply(401, { error: "reauthentication_required", max_age: MAX_AUTH_AGE_SECONDS, auth_age: age });
        const received = clock.now();
        const day = received.toISOString().slice(0, 10);
        const r = (
          await db.query("INSERT INTO dsar_requests (member_id, kind, received_at, due_on, verified_by, status) VALUES ($1, 'access+portability', $2, $3, $4, 'verified') RETURNING id", [
            s.member_id,
            received,
            dueOn(day),
            `password re-authentication ${age}s before the request`,
          ])
        ).rows[0];
        await event(r.id, "received", "access (art. 15) and portability (art. 20), through the portal");
        await event(r.id, "identity verified", `session re-authenticated ${age}s earlier (max ${MAX_AUTH_AGE_SECONDS}s)`);
        try {
          const x = await buildExport(db, s.member_id, { id: r.id, receivedAt: received, dueOn: dueOn(day) }, clock.now());
          archives.set(r.id, x.zip);
          await db.query("UPDATE dsar_requests SET status = 'completed', completed_at = $2, export_sha256 = $3 WHERE id = $1", [r.id, clock.now(), x.sha256]);
          await event(r.id, "export generated", `${x.files.length} files, ${x.zip.length} bytes, sha256 ${x.sha256.slice(0, 16)}`);
          return reply(201, { request_id: r.id, due_on: dueOn(day), extended_due_on: extendedDueOn(day), files: x.files.length, download: `/me/data-export/${r.id}` });
        } catch (e) {
          if (!(e instanceof InventoryIncomplete)) throw e;
          // fail closed: the request stays open (and its deadline keeps running) until the inventory is fixed
          await event(r.id, "export blocked", e.problems.join("; "));
          return reply(503, { error: "export blocked: the data inventory is incomplete", request_id: r.id, problems: e.problems });
        }
      }

      const m = /^\/me\/data-export\/(\d+)$/.exec(url.pathname);
      if (req.method === "GET" && m) {
        const r = (await db.query("SELECT id FROM dsar_requests WHERE id = $1 AND member_id = $2", [Number(m[1]), s.member_id])).rows[0];
        const zip = r && archives.get(r.id);
        if (!zip) return reply(404, { error: "no such export" }); // someone else's request looks the same as a missing one
        await event(r.id, "downloaded", `${zip.length} bytes`);
        res.writeHead(200, { "content-type": "application/zip", "content-disposition": `attachment; filename="export-${r.id}.zip"`, "cache-control": "no-store" });
        return res.end(zip);
      }
      reply(404, { error: "not found" });
    } catch (e) {
      console.error(e);
      reply(500, { error: String(e) });
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
