// The API behind the form, on node:http. It validates with the same domain functions as the browser, and leaves
// "one pending change per member" to the database so it holds under concurrent requests.
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import type pg from "pg";
import { monthlyPreview, validateChange } from "../domain/contribution.js";

export interface AppOptions {
  pool: pg.Pool;
  today: () => string; // YYYY-MM-DD, injected so tests control the clock
  latencyMs?: number[]; // a delay per POST, cycling: what a slow CI machine does to a request
  publicDir?: string;
}

export interface Member {
  id: string;
  name: string;
  employer: string;
  salary: number;
  rate: number;
  pending: { id: number; rate: number; effectiveFrom: string } | null;
  today: string;
}

const json = (res: ServerResponse, status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createApp(opts: AppOptions) {
  let posts = 0;

  async function member(id: string): Promise<Member | null> {
    const { rows } = await opts.pool.query(
      `SELECT m.id, m.name, m.employer, m.salary, m.rate, c.id AS change_id, c.rate AS change_rate, to_char(c.effective_from, 'YYYY-MM-DD') AS effective_from
       FROM members m LEFT JOIN contribution_changes c ON c.member_id = m.id AND c.status = 'pending' WHERE m.id = $1`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    // numeric columns arrive as strings from pg: convert at the edge, or "5" + 1 becomes "51"
    return {
      id: r.id,
      name: r.name,
      employer: r.employer,
      salary: Number(r.salary),
      rate: Number(r.rate),
      pending: r.change_id ? { id: r.change_id, rate: Number(r.change_rate), effectiveFrom: r.effective_from } : null,
      today: opts.today(),
    };
  }

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const m = /^\/api\/members\/([A-Z0-9]+)(\/contribution-changes)?$/.exec(url.pathname);
    try {
      if (m && !m[2] && req.method === "GET") {
        const found = await member(m[1]);
        return found ? json(res, 200, found) : json(res, 404, { error: "No such member" });
      }
      if (m && m[2] && req.method === "POST") {
        const delay = opts.latencyMs?.length ? opts.latencyMs[posts++ % opts.latencyMs.length] : 0;
        if (delay) await sleep(delay);
        let body: { rate?: unknown; effectiveFrom?: unknown };
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          body = JSON.parse(Buffer.concat(chunks).toString());
        } catch {
          return json(res, 400, { error: "Send JSON" });
        }
        const found = await member(m[1]);
        if (!found) return json(res, 404, { error: "No such member" });
        const result = validateChange({ rate: String(body.rate ?? ""), effectiveFrom: String(body.effectiveFrom ?? "") }, opts.today());
        if (!result.ok) return json(res, 422, { errors: result.errors });
        try {
          const { rows } = await opts.pool.query(
            "INSERT INTO contribution_changes (member_id, rate, effective_from) VALUES ($1, $2, $3) RETURNING id",
            [found.id, result.value.rate, result.value.effectiveFrom],
          );
          return json(res, 201, { id: rows[0].id, ...result.value, status: "pending", monthly: monthlyPreview(found.salary, result.value.rate) });
        } catch (e) {
          if ((e as { code?: string }).code === "23505") return json(res, 409, { error: "You already have a pending change. Wait for it to apply before asking for another." });
          throw e;
        }
      }
      if (opts.publicDir && req.method === "GET" && (url.pathname === "/" || url.pathname === "/app.js")) {
        const file = url.pathname === "/" ? "index.html" : "app.js";
        const body = await readFile(`${opts.publicDir}/${file}`);
        return res.writeHead(200, { "content-type": file.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8" }).end(body);
      }
      json(res, 404, { error: "Not found" });
    } catch (e) {
      console.error(e);
      json(res, 500, { error: "Something went wrong" });
    }
  };
}
