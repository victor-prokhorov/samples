import http from "node:http";
import { performance } from "node:perf_hooks";
import { PORT, db } from "./db.js";

type Ctx = { now: Date; member: number | null; session: string; body: Record<string, string> };
type Reply = { status: number; json: unknown };
type Route = { method: string; pattern: RegExp; template: string; handler: (ctx: Ctx, params: string[]) => Promise<Reply> };

// A failing database during a maintenance window, e.g. "2026-09-17T09:00Z/2026-09-17T13:00Z": writes and the history query fail with 503.
const [faultFrom, faultTo] = (process.env.FAULT_WINDOW ?? "/").split("/").map((s) => (s ? new Date(s) : null));
const faultyRoutes = new Set(["POST /changes", "GET /contributions"]);

async function track(ctx: Ctx, name: string, props: Record<string, unknown> = {}) {
  await db.query("INSERT INTO events (at, member_id, session_id, name, props) VALUES ($1, $2, $3, $4, $5)", [ctx.now, ctx.member, ctx.session, name, props]);
}

const ok = (json: unknown, status = 200): Reply => ({ status, json });

const routes: Route[] = [
  { method: "GET", pattern: /^\/health$/, template: "/health", handler: async () => ok({ status: "up" }) },
  {
    method: "POST",
    pattern: /^\/login$/,
    template: "/login",
    handler: async (ctx) => {
      await track(ctx, "login");
      return ok({ member: ctx.member });
    },
  },
  {
    method: "GET",
    pattern: /^\/profile$/,
    template: "/profile",
    handler: async (ctx) => {
      const { rows } = await db.query("SELECT id, name, employer_id FROM members WHERE id = $1", [ctx.member]);
      await track(ctx, "view_profile");
      return ok(rows[0]);
    },
  },
  {
    method: "GET",
    pattern: /^\/contributions$/,
    template: "/contributions",
    handler: async (ctx) => {
      // the history query walks every year of service, so members with a long career wait
      const { rows } = await db.query(
        "SELECT service_years, pg_sleep(CASE WHEN service_years > 30 THEN 0.2 + (service_years - 30) * 0.05 ELSE 0.002 END) FROM members WHERE id = $1",
        [ctx.member],
      );
      await track(ctx, "view_contributions", { years: rows[0].service_years });
      return ok({ years: rows[0].service_years });
    },
  },
  {
    method: "GET",
    pattern: /^\/changes\/new$/,
    template: "/changes/new",
    handler: async (ctx) => {
      await track(ctx, "change_started");
      return ok({ form: ["field", "value"] });
    },
  },
  {
    method: "POST",
    pattern: /^\/changes$/,
    template: "/changes",
    handler: async (ctx) => {
      const { field, value } = ctx.body;
      const error =
        field === "address" && !/\b\d{5}\b/.test(value ?? "") ? "postcode must be 5 digits" : field === "email" && !/^\S+@\S+$/.test(value ?? "") ? "email is not valid" : null;
      if (error) {
        await track(ctx, "change_rejected", { field, error });
        return ok({ error }, 422);
      }
      const { rows } = await db.query("INSERT INTO change_requests (member_id, field, value, submitted_at) VALUES ($1, $2, $3, $4) RETURNING id", [
        ctx.member,
        field,
        value,
        ctx.now,
      ]);
      await track(ctx, "change_submitted", { field, request_id: rows[0].id });
      return ok({ id: rows[0].id }, 201);
    },
  },
  {
    method: "POST",
    pattern: /^\/staff\/changes\/(\d+)\/resolve$/,
    template: "/staff/changes/:id/resolve",
    handler: async (ctx, [id]) => {
      await db.query("UPDATE change_requests SET status = 'approved', resolved_at = $2 WHERE id = $1", [id, ctx.now]);
      return ok({ id: Number(id), status: "approved" });
    },
  },
];

async function readBody(req: http.IncomingMessage) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  const started = performance.now();
  const path = new URL(req.url ?? "/", "http://x").pathname;
  // the simulator drives a clock so 28 days of traffic run in seconds; in production this is just new Date()
  const now = new Date((req.headers["x-sim-now"] as string) ?? Date.now());
  const ctx: Ctx = { now, member: Number(req.headers["x-member-id"]) || null, session: String(req.headers["x-session-id"] ?? "-"), body: {} };
  let template = "unmatched";
  let reply: Reply;
  try {
    ctx.body = await readBody(req);
    const route = routes.find((r) => r.method === req.method && r.pattern.test(path));
    if (!route) reply = ok({ error: "not found" }, 404);
    else {
      template = route.template;
      if (faultFrom && faultTo && now >= faultFrom && now < faultTo && faultyRoutes.has(`${route.method} ${template}`)) reply = ok({ error: "database unavailable" }, 503);
      else reply = await route.handler(ctx, route.pattern.exec(path)!.slice(1));
    }
  } catch (err) {
    reply = ok({ error: String(err) }, 500);
  }
  const duration = performance.now() - started;
  // logged before replying: once the client has its answer, the request is in request_log, even if the process is stopped right after
  await db.query("INSERT INTO request_log (at, method, route, status, duration_ms) VALUES ($1, $2, $3, $4, $5)", [now, req.method, template, reply.status, duration]);
  res.writeHead(reply.status, { "content-type": "application/json" }).end(JSON.stringify(reply.json));
});

server.listen(PORT, () => console.log(`   [portal pid ${process.pid}] listening on :${PORT}, every request in request_log, usage events in events`));
// SIGTERM: stop accepting connections, let the requests in flight finish, then close the pool
process.on("SIGTERM", () => server.close(() => void db.end().then(() => process.exit(0))));
