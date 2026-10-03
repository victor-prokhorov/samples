// A minimal node:http router used by both servers. Identity is a header naming a seeded user:
// authentication is 26-sso's subject; this sample starts once the user is known.
import { createServer, type IncomingMessage } from "node:http";
import type pg from "pg";
import type { User } from "./policy.js";

export type Ctx = { user: User | null; params: Record<string, string>; body: Record<string, unknown> };
export type Reply = { status: number; body: unknown };
export type Handler = (ctx: Ctx) => Promise<Reply>;
export type Route = { method: string; path: string; handler: Handler };

export const json = (status: number, body: unknown): Reply => ({ status, body });
export const forbidden = (why: string) => json(403, { error: "forbidden", why });

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

export async function loadUser(owner: pg.Pool, id: string | undefined): Promise<User | null> {
  if (!id) return null;
  const { rows } = await owner.query("SELECT id, role, org_id, member_id FROM users WHERE id = $1", [id]);
  return rows[0] ? { id: rows[0].id, role: rows[0].role, orgId: rows[0].org_id, memberId: rows[0].member_id } : null;
}

export function serve(owner: pg.Pool, routes: Route[]) {
  const table = routes.map((r) => {
    const keys: string[] = [];
    const re = new RegExp(`^${r.path.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)"))}$`);
    return { ...r, re, keys };
  });
  return createServer(async (req, res) => {
    let reply: Reply;
    try {
      const path = (req.url ?? "/").split("?")[0];
      const hit = table.find((r) => r.method === req.method && r.re.test(path));
      if (!hit) reply = json(404, { error: "no such route" });
      else {
        const values = hit.re.exec(path)!.slice(1);
        const user = await loadUser(owner, req.headers["x-user"] as string | undefined);
        reply = await hit.handler({ user, params: Object.fromEntries(hit.keys.map((k, i) => [k, values[i]])), body: await readBody(req) });
      }
    } catch (e) {
      reply = json(500, { error: (e as Error).message });
    }
    res.writeHead(reply.status, { "content-type": "application/json" });
    res.end(JSON.stringify(reply.body));
  });
}
