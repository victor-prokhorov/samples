// The domain app's HTTP side: the webhook endpoint, a member read, and the portal's email change written back.
import http from "node:http";
import type { MemberDirectory } from "../domain/ports.js";
import { validMember } from "../domain/model.js";
import type { Store } from "./store.js";
import { type Verify, handleWebhook } from "./webhooks.js";

export type AppDeps = { store: Store; dir: MemberDirectory; verify: Verify; now: () => number };

async function body(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString(); // the raw bytes are what was signed: verify before parsing
}

export function startApp(port: number, deps: AppDeps): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    const reply = (status: number, b: unknown) => (res.writeHead(status, { "content-type": "application/json" }), res.end(JSON.stringify(b)));
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const m = /^\/members\/(M\d{4})(\/email)?$/.exec(url.pathname);
      if (req.method === "POST" && url.pathname === "/webhooks/crm") {
        const r = await handleWebhook(await body(req), req.headers, deps);
        return reply(r.status, r.body);
      }
      if (req.method === "GET" && m && !m[2]) {
        const x = await deps.store.member(m[1]);
        return x ? reply(200, x.member) : reply(404, { error: "no such member" });
      }
      if (req.method === "POST" && m && m[2]) {
        const x = await deps.store.member(m[1]);
        if (!x) return reply(404, { error: "no such member" });
        const email = String(JSON.parse(await body(req)).email ?? "");
        const v = validMember({ ...x.member, email }, new Date(deps.now()).toISOString().slice(0, 10));
        if (!v.ok) return reply(422, { errors: v.reasons });
        const r = await deps.dir.changeEmail(x.ref, x.member, v.value.email);
        if (r.outcome === "conflict") return reply(409, r);
        // the CRM's own webhook for this write will arrive too: the version guard makes it a no-op or an update
        const fresh = await deps.dir.member(x.ref.id);
        if (fresh) await deps.store.applyMember(fresh);
        return reply(200, r);
      }
      if (url.pathname === "/health") return reply(200, { ok: true });
      reply(404, { error: "not found" });
    } catch (e) {
      console.error(e);
      reply(500, { error: String(e) });
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
